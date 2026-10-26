import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertMember, MSG_NOT_MEMBER } from './auth.js';
import { isTrustedCompletion } from './completion.js';
import { isLegacyNoDeadline, vnDayEndMillis } from './deadline.js';
import { isDocId, toJobInfo, type JobInfo } from './jobs.js';
import { paymentMatchesJob } from './payments.js';
import { POSTER_PENALTY, workerPenalty } from './reputation.js';
import type { MemberRole } from './types.js';

export const CANCEL_MSG = {
  invalid: 'Yêu cầu không hợp lệ.',
  invalidReason: 'Lý do hủy không hợp lệ.',
  reasonRequired: 'Vui lòng chọn lý do hủy công việc.',
  notCancellable: 'Không thể hủy công việc ở trạng thái hiện tại.',
  alreadyCancelled: 'Công việc này đã bị hủy.',
  workerConfirmed: 'Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.',
  workerReported: 'Bạn đã báo hoàn thành công việc này nên không thể hủy.',
  disputed: 'Thanh toán ký quỹ đang bị tranh chấp nên không thể hủy công việc.',
} as const;

/**
 * Byte-identical to the web CancelReason union (tests/unit/parity.test.ts reads it as text). On this branch that is
 * src/services/cancel.service.ts; slice 6b moves it to src/types/job.ts and repoints the parity test.
 */
export const CANCEL_REASONS = [
  'Không thể hoàn thành đúng deadline',
  'Yêu cầu công việc thay đổi quá nhiều',
  'Lý do cá nhân khẩn cấp',
  'Khác',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export interface CancelJobResult {
  penaltyPoints: number;
  status: 'cancelled' | 'open';
}

/** Validates the callable input (plan 2026-10-25-server-reputation, Decision 4.1). A missing reason is null. */
export function parseCancelInput(data: unknown): { jobId: string; reason: CancelReason | null } {
  const input = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const { jobId, reason } = input;
  if (!isDocId(jobId)) throw new HttpsError('invalid-argument', CANCEL_MSG.invalid);
  if (reason === undefined || reason === null) return { jobId, reason: null };
  if (typeof reason !== 'string' || !(CANCEL_REASONS as readonly string[]).includes(reason)) {
    throw new HttpsError('invalid-argument', CANCEL_MSG.invalidReason);
  }
  return { jobId, reason: reason as CancelReason };
}

/** Who the caller is on the job and the cheap checks, in Decision 4 order (2 to 6). */
export function cancelParties(
  jobId: string,
  job: DocumentData | undefined,
  uid: string,
  reason: CancelReason | null,
): { role: MemberRole; info: JobInfo; workerId: string | null } {
  const info = toJobInfo(jobId, job);
  const role = assertMember(info ?? undefined, uid);
  if (!info) throw new HttpsError('not-found', CANCEL_MSG.invalid); // unreachable: assertMember threw
  const assignee = info.assignedTo[0];
  if (role === 'worker' && uid !== assignee) throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
  if (info.status === 'cancelled') throw new HttpsError('failed-precondition', CANCEL_MSG.alreadyCancelled);
  const cancellable = role === 'poster' ? info.status === 'open' || info.status === 'in-progress' : info.status === 'in-progress';
  if (!cancellable) throw new HttpsError('failed-precondition', CANCEL_MSG.notCancellable);
  if (role === 'worker' && reason === null) throw new HttpsError('invalid-argument', CANCEL_MSG.reasonRequired);
  const workerId = isDocId(assignee) && assignee !== info.postedBy ? assignee : null;
  return { role, info, workerId };
}

export interface CancelPlan {
  next: 'cancelled' | 'open';
  penalisedUid: string | null;
  points: number;
  refund: boolean;
}

/** Decision 4.7 and 4.8 (completion and dispute denials), then the effects of Decision 5. */
export function planCancel(p: {
  role: MemberRole;
  info: JobInfo;
  workerId: string | null;
  job: DocumentData;
  completion: DocumentData | undefined;
  payment: DocumentData | undefined;
  now: number;
}): CancelPlan {
  const { role, info, workerId, job, completion, payment, now } = p;
  const inProgress = info.status === 'in-progress';
  const matching = paymentMatchesJob(payment, info.id, job);
  if (inProgress) {
    if (isTrustedCompletion(completion, info.id) && completion?.workerConfirmed === true) {
      throw new HttpsError('failed-precondition', role === 'poster' ? CANCEL_MSG.workerConfirmed : CANCEL_MSG.workerReported);
    }
    if ((matching && payment?.status === 'disputed') || job.paymentStatus === 'disputed') {
      throw new HttpsError('failed-precondition', CANCEL_MSG.disputed);
    }
  }
  const refund = inProgress && matching && payment?.status === 'held';
  if (role === 'worker') {
    // Same day semantics as the expiry scheduler: the deadline day ends at 23:59:59.999 +07:00; a legacy "no deadline" job has none.
    const deadlineMs = job.deadline instanceof Timestamp && !isLegacyNoDeadline(job) ? vnDayEndMillis(job.deadline) : null;
    return { next: 'open', penalisedUid: workerId, points: workerPenalty(deadlineMs, now), refund };
  }
  if (!inProgress || !workerId) return { next: 'cancelled', penalisedUid: null, points: 0, refund };
  return { next: 'cancelled', penalisedUid: info.postedBy, points: POSTER_PENALTY, refund };
}
