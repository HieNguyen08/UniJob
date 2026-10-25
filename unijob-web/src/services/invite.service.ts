import app from '@/lib/firebase';
import type { SendJobInviteResult } from '@/types';

const FUNCTIONS_REGION = 'asia-southeast1';
export const INVITE_FALLBACK_ERROR = 'Không thể gửi lời mời, thử lại';

type UserFacingCode = 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition' | 'unauthenticated';

/**
 * Local Vietnamese text per user-facing callable code. Used when the error does not carry a known
 * server message: the SDK builds FunctionsError from bare HTTP statuses with message == the code
 * name (function not deployed, wrong region, IAM), which must never reach the toast.
 */
export const INVITE_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Lời mời không hợp lệ.',
  'not-found': 'Không tìm thấy công việc hoặc người được mời.',
  'permission-denied': 'Bạn không có quyền gửi lời mời này.',
  'failed-precondition': 'Công việc này không còn nhận ứng viên.',
  unauthenticated: 'Bạn cần đăng nhập để gửi lời mời.',
};

/**
 * Exact messages the sendJobInvite callable throws (functions/src/handlers/invites.ts INVITE_MSG,
 * functions/src/lib/auth.ts MSG_JOB_NOT_FOUND and MSG_UNAUTHENTICATED). Only these are shown verbatim.
 */
export const INVITE_SERVER_MESSAGES: ReadonlySet<string> = new Set([
  'Lời mời không hợp lệ.',
  'Bạn không thể tự mời chính mình.',
  'Chỉ người đăng việc mới gửi được lời mời.',
  'Công việc này không còn nhận ứng viên.',
  'Không tìm thấy người được mời.',
  'Không tìm thấy công việc.',
  'Bạn cần đăng nhập để thực hiện thao tác này.',
]);

/** The poster invites a worker to an open job. The server writes the job_invite notification. */
export async function sendJobInvite(jobId: string, workerId: string): Promise<SendJobInviteResult> {
  // lazy: keeps firebase/functions out of the entry chunk
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ jobId: string; workerId: string }, SendJobInviteResult>(
    getFunctions(app, FUNCTIONS_REGION),
    'sendJobInvite'
  );
  const { data } = await call({ jobId, workerId });
  return data;
}

/**
 * Toast text for a failed invite: the server's message when it is one of the known server strings,
 * otherwise the local Vietnamese text for the code, otherwise the generic fallback.
 */
export function inviteErrorMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return INVITE_FALLBACK_ERROR;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !code.startsWith('functions/')) return INVITE_FALLBACK_ERROR;
  const short = code.slice('functions/'.length);
  if (!Object.hasOwn(INVITE_CODE_MESSAGES, short)) return INVITE_FALLBACK_ERROR;
  if (typeof message === 'string' && INVITE_SERVER_MESSAGES.has(message)) return message;
  return INVITE_CODE_MESSAGES[short as UserFacingCode];
}
