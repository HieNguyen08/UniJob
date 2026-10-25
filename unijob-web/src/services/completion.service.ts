import app from '@/lib/firebase';
import { callableErrorMessage, type UserFacingCode } from '@/lib/callableError';
import type { ConfirmCompletionResult } from '@/types';

const FUNCTIONS_REGION = 'asia-southeast1';
export const COMPLETION_FALLBACK_ERROR = 'Không thể xác nhận hoàn thành, thử lại';
export const COMPLETION_ALREADY_DONE_MESSAGE = 'Công việc này đã được xác nhận hoàn thành.';

export const COMPLETION_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Yêu cầu xác nhận hoàn thành không hợp lệ.',
  'not-found': 'Không tìm thấy công việc.',
  'permission-denied': 'Bạn không có quyền xác nhận hoàn thành công việc này.',
  'failed-precondition': 'Công việc không còn ở trạng thái có thể xác nhận hoàn thành.',
  unauthenticated: 'Bạn cần đăng nhập để xác nhận hoàn thành.',
};

/**
 * Exact messages the confirmCompletion callable throws (5a plan docs/plans/2026-10-25-server-completion.md:
 * the confirmCompletion handler messages; functions/src/lib/auth.ts MSG_UNAUTHENTICATED, MSG_NOT_MEMBER,
 * MSG_JOB_NOT_FOUND, MSG_NOT_VERIFIED).
 */
export const COMPLETION_SERVER_MESSAGES: ReadonlySet<string> = new Set([
  'Yêu cầu không hợp lệ.',
  'Chỉ có thể xác nhận hoàn thành khi công việc đang được thực hiện.',
  COMPLETION_ALREADY_DONE_MESSAGE,
  'Công việc này chưa có người làm hợp lệ.',
  'Người làm chưa báo hoàn thành công việc.',
  'Không tìm thấy công việc.',
  'Bạn cần đăng nhập để thực hiện thao tác này.',
  'Bạn không có quyền thực hiện thao tác này với công việc này.',
  'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
]);

/**
 * Worker reports or poster confirms completion. The server records the caller's side and, once both
 * sides have confirmed, completes the job, writes work history and releases escrow.
 */
export async function confirmCompletion(jobId: string): Promise<ConfirmCompletionResult> {
  // lazy: keeps firebase/functions out of the entry chunk
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ jobId: string }, ConfirmCompletionResult>(
    getFunctions(app, FUNCTIONS_REGION),
    'confirmCompletion'
  );
  const { data } = await call({ jobId });
  return data;
}

export function completionErrorMessage(err: unknown): string {
  return callableErrorMessage(err, {
    codeMessages: COMPLETION_CODE_MESSAGES,
    serverMessages: COMPLETION_SERVER_MESSAGES,
    fallback: COMPLETION_FALLBACK_ERROR,
  });
}

/** The job was already completed (e.g. from another tab): the UI should refresh rather than just show an error. */
export function isCompletionAlreadyDone(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === 'functions/failed-precondition' && e.message === COMPLETION_ALREADY_DONE_MESSAGE;
}

/** The job is no longer in a state that accepts confirmation (cancelled, completed elsewhere): refresh and close. */
export function isCompletionPreconditionFailed(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'functions/failed-precondition';
}

export function completionSuccessMessage(result: ConfirmCompletionResult, role: 'worker' | 'poster'): string {
  if (result.status === 'confirmed') return 'Công việc đã hoàn thành! Bạn có thể đánh giá ngay.';
  return role === 'worker'
    ? 'Đã gửi báo cáo hoàn thành! Chờ người đăng xác nhận.'
    : 'Đã xác nhận. Đang chờ người làm báo hoàn thành.';
}
