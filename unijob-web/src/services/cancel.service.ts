import app from '@/lib/firebase';
import { callableErrorMessage, type UserFacingCode } from '@/lib/callableError';
import type { CancelReason, CancelJobResult } from '@/types';

export type { CancelReason };

const FUNCTIONS_REGION = 'asia-southeast1';
export const CANCEL_FALLBACK_ERROR = 'Có lỗi xảy ra khi hủy công việc.';

export const CANCEL_REASONS: readonly CancelReason[] = [
  'Không thể hoàn thành đúng deadline',
  'Yêu cầu công việc thay đổi quá nhiều',
  'Lý do cá nhân khẩn cấp',
  'Khác',
];

export const CANCEL_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Yêu cầu hủy công việc không hợp lệ.',
  'not-found': 'Không tìm thấy công việc.',
  'permission-denied': 'Bạn không có quyền hủy công việc này.',
  'failed-precondition': 'Công việc không còn ở trạng thái có thể hủy.',
  unauthenticated: 'Bạn cần đăng nhập để hủy công việc.',
};

/**
 * Exact messages the cancelJob callable throws (6a plan docs/plans/2026-10-25-server-reputation.md:
 * the cancelJob handler CANCEL_MSG; functions/src/lib/auth.ts MSG_UNAUTHENTICATED, MSG_NOT_VERIFIED,
 * MSG_NOT_MEMBER, MSG_JOB_NOT_FOUND).
 */
export const CANCEL_SERVER_MESSAGES: ReadonlySet<string> = new Set([
  'Yêu cầu không hợp lệ.',
  'Lý do hủy không hợp lệ.',
  'Vui lòng chọn lý do hủy công việc.',
  'Không thể hủy công việc ở trạng thái hiện tại.',
  'Công việc này đã bị hủy.',
  'Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.',
  'Bạn đã báo hoàn thành công việc này nên không thể hủy.',
  'Thanh toán ký quỹ đang bị tranh chấp nên không thể hủy công việc.',
  'Không tìm thấy công việc.',
  'Bạn cần đăng nhập để thực hiện thao tác này.',
  'Bạn không có quyền thực hiện thao tác này với công việc này.',
  'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
]);

/**
 * Cancels a job through the server: it checks the caller, applies the penalty, refunds held escrow,
 * reopens the job (worker) or cancels it (poster), and notifies the other side.
 */
export async function cancelJob(jobId: string, reason: CancelReason): Promise<CancelJobResult> {
  // lazy: keeps firebase/functions out of the entry chunk
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ jobId: string; reason: CancelReason }, CancelJobResult>(
    getFunctions(app, FUNCTIONS_REGION),
    'cancelJob'
  );
  const { data } = await call({ jobId, reason });
  return data;
}

export function cancelSuccessMessage(result: CancelJobResult): string {
  const p = result.penaltyPoints;
  if (result.status === 'open') {
    if (p >= 20) return `Hủy sát giờ — bạn bị trừ ${p} điểm uy tín.`;
    if (p > 0) return `Đã hủy — bạn bị trừ ${p} điểm uy tín.`;
    return 'Đã hủy việc thành công.';
  }
  return p > 0
    ? `Đã hủy việc — bạn bị trừ ${p} điểm uy tín vì đã có người nhận việc.`
    : 'Đã hủy việc thành công.';
}

export function cancelErrorMessage(err: unknown): string {
  return callableErrorMessage(err, {
    codeMessages: CANCEL_CODE_MESSAGES,
    serverMessages: CANCEL_SERVER_MESSAGES,
    fallback: CANCEL_FALLBACK_ERROR,
  });
}

/** The job is no longer cancellable (e.g. cancelled elsewhere): the UI should refresh and close. */
export function isCancelPreconditionFailed(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'functions/failed-precondition';
}
