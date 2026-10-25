import app from '@/lib/firebase';
import { callableErrorMessage, type UserFacingCode } from '@/lib/callableError';
import type { DisputePaymentResult, Payment } from '@/types';

const FUNCTIONS_REGION = 'asia-southeast1';
export const DISPUTE_REASON_MIN = 10;
export const DISPUTE_REASON_MAX = 500;
export const DISPUTE_FALLBACK_ERROR = 'Không thể gửi báo cáo tranh chấp, thử lại';

export const DISPUTE_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Lý do tranh chấp phải dài từ 10 đến 500 ký tự.',
  'not-found': 'Không tìm thấy công việc hoặc khoản ký quỹ.',
  'permission-denied': 'Bạn không có quyền báo tranh chấp cho công việc này.',
  'failed-precondition': 'Khoản thanh toán này không còn ở trạng thái ký quỹ.',
  unauthenticated: 'Bạn cần đăng nhập để báo tranh chấp.',
};

/**
 * Exact messages the disputePayment callable throws (functions/src/handlers/disputes.ts DISPUTE_MSG,
 * functions/src/lib/auth.ts MSG_UNAUTHENTICATED, MSG_NOT_MEMBER, MSG_JOB_NOT_FOUND, MSG_NOT_VERIFIED).
 */
export const DISPUTE_SERVER_MESSAGES: ReadonlySet<string> = new Set([
  'Yêu cầu không hợp lệ.',
  'Lý do tranh chấp phải dài từ 10 đến 500 ký tự.',
  'Chưa có thanh toán ký quỹ cho công việc này.',
  'Chỉ có thể báo tranh chấp khi tiền đang được giữ ký quỹ.',
  'Không tìm thấy công việc.',
  'Bạn cần đăng nhập để thực hiện thao tác này.',
  'Bạn không có quyền thực hiện thao tác này với công việc này.',
  'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
]);

/** Returns a Vietnamese error for an invalid reason (length counted after trimming), else null. */
export function validateDisputeReason(reason: string): string | null {
  const length = Array.from(reason.trim()).length; // code points, same as the server
  if (length < DISPUTE_REASON_MIN) return `Lý do cần ít nhất ${DISPUTE_REASON_MIN} ký tự.`;
  if (length > DISPUTE_REASON_MAX) return `Lý do tối đa ${DISPUTE_REASON_MAX} ký tự.`;
  return null;
}

/** Payer or payee of a held server-created payment (id `{jobId}_{payeeId}`). Legacy random-id payments are excluded. */
export function canDisputePayment(
  payment: Pick<Payment, 'id' | 'jobId' | 'payerId' | 'payeeId' | 'status'>,
  uid: string | undefined
): boolean {
  return (
    !!uid &&
    payment.status === 'held' &&
    (uid === payment.payerId || uid === payment.payeeId) &&
    payment.id === `${payment.jobId}_${payment.payeeId}`
  );
}

/** Payer or payee reports a dispute on a held escrow. The server updates the payment and notifies the other party. */
export async function disputePayment(jobId: string, reason: string): Promise<DisputePaymentResult> {
  // lazy: keeps firebase/functions out of the entry chunk
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ jobId: string; reason: string }, DisputePaymentResult>(
    getFunctions(app, FUNCTIONS_REGION),
    'disputePayment'
  );
  const { data } = await call({ jobId, reason: reason.trim() });
  return data;
}

export function disputeErrorMessage(err: unknown): string {
  return callableErrorMessage(err, {
    codeMessages: DISPUTE_CODE_MESSAGES,
    serverMessages: DISPUTE_SERVER_MESSAGES,
    fallback: DISPUTE_FALLBACK_ERROR,
  });
}
