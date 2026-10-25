import type { DocumentData } from 'firebase-admin/firestore';
import { toJobInfo } from './jobs.js';

/** Ledger only: no money moves (no payment provider). Amounts are VND integers. */
export const MAX_ESCROW_AMOUNT = 100_000_000;

export type PaymentStatus = 'held' | 'released' | 'refunded' | 'disputed';

/** Fields of a server-written held payment; the handler adds the timestamps. */
export interface HeldPaymentFields {
  jobId: string;
  jobTitle: string;
  payerId: string;
  payeeId: string;
  amount: number;
  platformFee: number;
  netAmount: number;
  status: 'held';
  method: 'platform_escrow';
  note: '';
  source: 'server';
}

export const paymentIdFor = (jobId: string, payeeId: string): string => `${jobId}_${payeeId}`;

export type EscrowAmount =
  | { ok: true; amount: number }
  | { ok: false; reason: 'volunteer' | 'invalid_amount' | 'over_cap' };

/** The escrow amount of a job (`jobs.payment`), or why none is held. */
export function escrowAmount(job: DocumentData): EscrowAmount {
  if (job.paymentType === 'volunteer') return { ok: false, reason: 'volunteer' };
  const amount: unknown = job.payment;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (amount > MAX_ESCROW_AMOUNT) return { ok: false, reason: 'over_cap' };
  return { ok: true, amount };
}

/** Only documents written by the server count; clients can still create payments until slice 4b's rules. */
export const isServerPayment = (data: DocumentData | undefined): boolean => data?.source === 'server';

/**
 * True when a stored payment is a server record for exactly these parties (jobId, payer, payee).
 * The amount and status are not compared: an existing record is never overwritten by a redelivered event.
 */
export function paymentMatchesHeld(
  pay: DocumentData | undefined,
  fields: Pick<HeldPaymentFields, 'jobId' | 'payerId' | 'payeeId'>,
): boolean {
  return isServerPayment(pay) && pay?.jobId === fields.jobId && pay?.payerId === fields.payerId && pay?.payeeId === fields.payeeId;
}

/**
 * Defense in depth for release/dispute: a server payment must belong to this job (jobId, payer = poster,
 * payee = first valid assignee, normalised like toJobInfo). The amount is not compared: jobs.payment is
 * poster-editable and the payment record is the source of truth for it.
 */
export function paymentMatchesJob(pay: DocumentData | undefined, jobId: string, job: DocumentData | undefined): boolean {
  const info = toJobInfo(jobId, job);
  if (!pay || !info || !isServerPayment(pay)) return false;
  return pay.jobId === jobId && pay.payerId === info.postedBy && pay.payeeId === info.assignedTo[0];
}

/** The stored amounts are usable: amount an integer in 1..MAX_ESCROW_AMOUNT and netAmount === amount - platformFee. */
export function paymentAmountsSane(pay: DocumentData | undefined): boolean {
  if (!pay) return false;
  const { amount, platformFee, netAmount } = pay;
  return (
    typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    amount >= 1 &&
    amount <= MAX_ESCROW_AMOUNT &&
    typeof platformFee === 'number' &&
    typeof netAmount === 'number' &&
    netAmount === amount - platformFee
  );
}
