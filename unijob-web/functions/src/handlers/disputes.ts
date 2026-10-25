import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertMember, MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER } from '../lib/auth.js';
import { isDocId, toJobInfo } from '../lib/jobs.js';
import { clip, messages, safeText, safeTitle } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';
import { paymentIdFor, paymentMatchesJob } from '../lib/payments.js';

export const DISPUTE_MSG = {
  invalid: 'Yêu cầu không hợp lệ.',
  reasonLength: 'Lý do tranh chấp phải dài từ 10 đến 500 ký tự.',
  noPayment: 'Chưa có thanh toán ký quỹ cho công việc này.',
  notHeld: 'Chỉ có thể báo tranh chấp khi tiền đang được giữ ký quỹ.',
} as const;

export const REASON_MIN = 10;
export const REASON_MAX = 500;

export interface DisputePaymentResult {
  disputed: true;
}

/** Validates the callable input; the reason is trimmed and measured in code points. */
export function parseDisputeInput(data: unknown): { jobId: string; reason: string } {
  const input = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const { jobId } = input;
  if (!isDocId(jobId)) throw new HttpsError('invalid-argument', DISPUTE_MSG.invalid);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const length = Array.from(reason).length;
  if (length < REASON_MIN || length > REASON_MAX) throw new HttpsError('invalid-argument', DISPUTE_MSG.reasonLength);
  return { jobId, reason };
}

/** The poster or the worker freezes a held server payment; the other party is notified (without the reason). */
export async function handleDisputePayment(db: Firestore, uid: string, data: unknown): Promise<DisputePaymentResult> {
  const { jobId, reason } = parseDisputeInput(data);
  const jobRef = db.collection('jobs').doc(jobId);
  const { otherParty, title } = await db.runTransaction(async (tx) => {
    const jobData = (await tx.get(jobRef)).data();
    const job = toJobInfo(jobId, jobData);
    if (!job) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
    const role = assertMember(job, uid);
    const payee = job.assignedTo[0];
    if (!isDocId(payee)) throw new HttpsError('not-found', DISPUTE_MSG.noPayment);
    const payRef = db.collection('payments').doc(paymentIdFor(jobId, payee));
    const pay = (await tx.get(payRef)).data();
    if (!paymentMatchesJob(pay, jobId, jobData)) throw new HttpsError('not-found', DISPUTE_MSG.noPayment);
    // The poster must be the payer and the worker the payee (a second assignee is no party to the payment).
    if (uid !== (role === 'poster' ? pay?.payerId : pay?.payeeId)) throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
    if (pay?.status !== 'held') throw new HttpsError('failed-precondition', DISPUTE_MSG.notHeld);
    tx.update(payRef, {
      status: 'disputed',
      disputedBy: uid,
      disputedAt: FieldValue.serverTimestamp(),
      disputeReason: clip(safeText(reason), REASON_MAX),
    });
    tx.update(jobRef, { paymentStatus: 'disputed' });
    return { otherParty: role === 'poster' ? String(pay?.payeeId) : String(pay?.payerId), title: job.title };
  });
  try {
    await writeNotification(db, {
      userId: otherParty,
      type: 'payment_disputed',
      message: messages.paymentDisputed(title),
      extras: { jobId, jobTitle: safeTitle(title) },
      sourceId: jobId,
    });
  } catch (error) {
    logger.error('disputePayment: notification failed after commit', { jobId, error });
  }
  return { disputed: true };
}
