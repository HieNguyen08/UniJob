import type { DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertMember, MSG_NOT_MEMBER } from './auth.js';
import { isDocId, toJobInfo, type JobInfo } from './jobs.js';
import { safeTitle } from './messages.js';
import type { MemberRole } from './types.js';

export const COMPLETION_MSG = {
  invalid: 'Yêu cầu không hợp lệ.',
  notInProgress: 'Chỉ có thể xác nhận hoàn thành khi công việc đang được thực hiện.',
  alreadyCompleted: 'Công việc này đã được xác nhận hoàn thành.',
  noWorker: 'Công việc này chưa có người làm hợp lệ.',
  workerFirst: 'Người làm chưa báo hoàn thành công việc.',
} as const;

/**
 * Marker written with `source: 'server'` on every completion record the callable creates. Before the slice 3 rules,
 * clients could write any field including `source: 'server'`, but never this one, so a doc is trusted only with both
 * (and only under its own job id). The 5b client's getJobCompletion filter must use the same check.
 */
export const COMPLETION_VERSION = 'completion-v1';

/** True for a completion record written by confirmCompletion for this job. */
export function isTrustedCompletion(doc: DocumentData | undefined, completionId: string): boolean {
  return !!doc && doc.source === 'server' && doc.serverVersion === COMPLETION_VERSION && doc.jobId === completionId;
}

export interface CompletionState {
  status: 'pending' | 'confirmed';
  workerConfirmed: boolean;
  posterConfirmed: boolean;
}
export type ConfirmCompletionResult = CompletionState;
export type CompletionStep = { write: false; state: CompletionState } | { write: true; create: boolean; state: CompletionState };

/** Validates the callable input. */
export function parseCompletionInput(data: unknown): { jobId: string } {
  const input = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const { jobId } = input;
  if (!isDocId(jobId)) throw new HttpsError('invalid-argument', COMPLETION_MSG.invalid);
  return { jobId };
}

/** Who the caller is on the job, and the checks that must pass before a confirmation counts (order matters). */
export function completionParties(
  jobId: string,
  job: DocumentData | undefined,
  uid: string,
): { role: MemberRole; info: JobInfo; workerId: string } {
  const info = toJobInfo(jobId, job);
  const role = assertMember(info ?? undefined, uid);
  const workerId = info?.assignedTo[0];
  if (role === 'worker' && uid !== workerId) throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
  if (!info) throw new HttpsError('not-found', COMPLETION_MSG.invalid); // unreachable: assertMember threw
  if (info.status === 'completed') throw new HttpsError('failed-precondition', COMPLETION_MSG.alreadyCompleted);
  if (info.status !== 'in-progress') throw new HttpsError('failed-precondition', COMPLETION_MSG.notInProgress);
  if (!isDocId(workerId) || !isDocId(info.postedBy) || info.postedBy === workerId) {
    throw new HttpsError('failed-precondition', COMPLETION_MSG.noWorker);
  }
  return { role, info, workerId };
}

const stateOf = (workerConfirmed: boolean, posterConfirmed: boolean): CompletionState => ({
  status: workerConfirmed && posterConfirmed ? 'confirmed' : 'pending',
  workerConfirmed,
  posterConfirmed,
});

/**
 * The next completion record for this side's confirmation. Flags count only when `=== true`, and only on a doc
 * with the server marker (`isTrustedCompletion`): a doc without it (legacy, or forged under the older rules) is treated as absent, so the
 * worker's confirmation overwrites it with a fresh server record and the poster gets `workerFirst`.
 */
export function nextCompletionStep(role: MemberRole, rawCurrent: DocumentData | undefined, jobId: string): CompletionStep {
  const current = isTrustedCompletion(rawCurrent, jobId) ? rawCurrent : undefined;
  if (!current) {
    if (role === 'poster') throw new HttpsError('failed-precondition', COMPLETION_MSG.workerFirst);
    return { write: true, create: true, state: stateOf(true, false) };
  }
  const worker = current.workerConfirmed === true;
  const poster = current.posterConfirmed === true;
  const own = role === 'worker' ? worker : poster;
  const other = role === 'worker' ? poster : worker;
  if (own && !other) return { write: false, state: stateOf(worker, poster) };
  return { write: true, create: false, state: role === 'worker' ? stateOf(true, poster) : stateOf(worker, true) };
}

export const workHistoryIdFor = (jobId: string, workerId: string): string => `${jobId}_${workerId}`;

export interface WorkHistoryFields {
  user1: string;
  user2: string;
  jobId: string;
  jobTitle: string;
  category: string;
  source: 'server';
  serverVersion: typeof COMPLETION_VERSION;
}

export function planWorkHistory(info: JobInfo, job: DocumentData, workerId: string): WorkHistoryFields {
  return {
    user1: info.postedBy,
    user2: workerId,
    jobId: info.id,
    jobTitle: safeTitle(info.title),
    category: typeof job.category === 'string' ? job.category : '',
    source: 'server',
    serverVersion: COMPLETION_VERSION,
  };
}
