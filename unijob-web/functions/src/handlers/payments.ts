import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { calculatePlatformFee } from '../lib/fees.js';
import { isDocId, toJobInfo } from '../lib/jobs.js';
import { safeTitle } from '../lib/messages.js';
import {
  escrowAmount,
  paymentAmountsSane,
  paymentIdFor,
  paymentMatchesHeld,
  paymentMatchesJob,
  type HeldPaymentFields,
} from '../lib/payments.js';

/** open -> in-progress with exactly one valid (normalised) assignee: that assignee is the payee. */
export function holdCandidate(
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): { payeeId: string } | null {
  if (!isDocId(jobId) || before?.status !== 'open' || after?.status !== 'in-progress') return null;
  const assignedTo = toJobInfo(jobId, after)?.assignedTo ?? [];
  if (assignedTo.length !== 1 || !isDocId(assignedTo[0])) return null;
  return { payeeId: assignedTo[0] };
}

export type EscrowSkipReason =
  | 'job_missing'
  | 'job_not_in_progress'
  | 'not_assigned'
  | 'bad_poster'
  | 'volunteer'
  | 'invalid_amount'
  | 'over_cap';

export function planHeldPayment(
  jobId: string,
  applicantId: string,
  job: DocumentData | undefined,
): { ok: true; payment: HeldPaymentFields } | { ok: false; reason: EscrowSkipReason } {
  const info = toJobInfo(jobId, job);
  if (!info || !job) return { ok: false, reason: 'job_missing' };
  if (info.status !== 'in-progress') return { ok: false, reason: 'job_not_in_progress' };
  if (!info.assignedTo.includes(applicantId)) return { ok: false, reason: 'not_assigned' };
  if (!isDocId(info.postedBy) || info.postedBy === applicantId) return { ok: false, reason: 'bad_poster' };
  const amount = escrowAmount(job);
  if (!amount.ok) return { ok: false, reason: amount.reason };
  const platformFee = calculatePlatformFee(amount.amount);
  return {
    ok: true,
    payment: {
      jobId,
      jobTitle: safeTitle(info.title),
      payerId: info.postedBy,
      payeeId: applicantId,
      amount: amount.amount,
      platformFee,
      netAmount: amount.amount - platformFee,
      status: 'held',
      method: 'platform_escrow',
      note: '',
      source: 'server',
    },
  };
}

export type HoldEscrowResult = 'created' | 'exists' | 'skipped';

/**
 * A job going open -> in-progress with one assignee whose application is accepted holds the job's payment
 * in escrow (a ledger record, no money moves). An existing server record for the same parties is kept as is.
 */
export async function handleEscrowOnAssign(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<HoldEscrowResult> {
  const c = holdCandidate(jobId, before, after);
  if (!c) return 'skipped';
  const jobRef = db.collection('jobs').doc(jobId);
  const appRef = db.collection('applications').doc(paymentIdFor(jobId, c.payeeId));
  const payRef = db.collection('payments').doc(paymentIdFor(jobId, c.payeeId));
  return db.runTransaction(async (tx) => {
    const [jobSnap, appSnap, paySnap] = await Promise.all([tx.get(jobRef), tx.get(appRef), tx.get(payRef)]);
    const plan = planHeldPayment(jobId, c.payeeId, jobSnap.data());
    if (!plan.ok) {
      const log = plan.reason === 'over_cap' ? logger.warn : logger.info;
      log('escrow: no payment on assignment', { jobId, reason: plan.reason });
      return 'skipped';
    }
    if (appSnap.data()?.status !== 'accepted') {
      logger.info('escrow: no payment, the application is not accepted', { jobId, payeeId: c.payeeId });
      return 'skipped';
    }
    if (paymentMatchesHeld(paySnap.data(), plan.payment)) {
      if (paySnap.get('amount') !== plan.payment.amount) {
        logger.warn('escrow: held payment amount differs from the job', { jobId, paymentId: payRef.id });
      }
      return 'exists';
    }
    if (paySnap.exists) logger.warn('escrow: replacing a non-matching payment doc', { paymentId: payRef.id });
    tx.set(payRef, { ...plan.payment, createdAt: FieldValue.serverTimestamp(), heldAt: FieldValue.serverTimestamp(), releasedAt: null });
    tx.update(jobRef, { paymentStatus: 'held' });
    return 'created';
  });
}

export type ReleaseEscrowResult = 'released' | 'skipped';

/**
 * A job moving to `completed` releases the held server payment of its first valid assignee.
 * Cancellation never refunds here: held escrow stays `held` until slice 6's cancelJob (KNOWN HOLE 6).
 */
export async function handleEscrowOnJobUpdate(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<ReleaseEscrowResult> {
  if (!before || !after || before.status === 'completed' || after.status !== 'completed') return 'skipped';
  const payee = toJobInfo(jobId, after)?.assignedTo[0];
  if (!isDocId(payee)) return 'skipped';
  const jobRef = db.collection('jobs').doc(jobId);
  const payRef = db.collection('payments').doc(paymentIdFor(jobId, payee));
  return db.runTransaction(async (tx) => {
    const [jobSnap, paySnap] = await Promise.all([tx.get(jobRef), tx.get(payRef)]);
    const pay = paySnap.data();
    if (!paymentMatchesJob(pay, jobId, jobSnap.data())) {
      if (escrowAmount(after).ok) {
        logger.error('escrow: paid job completed without a matching server payment', { jobId, paymentId: payRef.id, exists: paySnap.exists });
      } else {
        logger.info('escrow: nothing to release', { jobId });
      }
      return 'skipped';
    }
    if (pay?.status !== 'held') {
      logger.info('escrow: nothing to release', { jobId, paymentStatus: pay?.status ?? null });
      return 'skipped';
    }
    if (!paymentAmountsSane(pay)) {
      logger.warn('escrow: payment amounts are inconsistent, not released', { jobId, paymentId: payRef.id });
      return 'skipped';
    }
    tx.update(payRef, { status: 'released', releasedAt: FieldValue.serverTimestamp() });
    tx.update(jobRef, { paymentStatus: 'released' });
    return 'released';
  });
}

export type EscrowResult = HoldEscrowResult | ReleaseEscrowResult;

/** Entry point of the escrow trigger: hold on open -> in-progress, release on -> completed. Throws on unexpected errors (retried). */
export async function handleEscrow(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<EscrowResult> {
  const held = await handleEscrowOnAssign(db, jobId, before, after);
  if (held !== 'skipped') return held;
  return handleEscrowOnJobUpdate(db, jobId, before, after);
}
