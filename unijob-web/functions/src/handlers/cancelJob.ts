import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { cancelParties, parseCancelInput, planCancel, type CancelJobResult } from '../lib/cancel.js';
import { messages, safeTitle } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';
import { paymentIdFor } from '../lib/payments.js';
import { profileStub } from '../lib/profileStub.js';
import { planPenalty } from '../lib/reputation.js';

export type { CancelJobResult } from '../lib/cancel.js';

/**
 * The poster or the assigned worker cancels a job in one transaction: job and application status, held escrow
 * refunded, penalty points and the recomputed score on the penalised user. The checks and their order are
 * Decision 4 of docs/plans/2026-10-25-server-reputation.md, the effects Decision 5. All reads come before any
 * write. activeJobCount is not touched here: onJobCounters reconciles it from the job status.
 */
export async function handleCancelJob(
  db: Firestore,
  uid: string,
  data: unknown,
  now: () => number = Date.now,
): Promise<CancelJobResult> {
  const { jobId, reason } = parseCancelInput(data);
  const jobRef = db.collection('jobs').doc(jobId);

  const { result, notify } = await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    const job: DocumentData = jobSnap.data() ?? {};
    const { role, info, workerId } = cancelParties(jobId, jobSnap.data(), uid, reason);

    const payRef = workerId ? db.collection('payments').doc(paymentIdFor(jobId, workerId)) : null;
    const appRef = role === 'worker' && workerId ? db.collection('applications').doc(`${jobId}_${workerId}`) : null;
    const [completion, payment, application] = await Promise.all([
      tx.get(db.collection('jobCompletions').doc(jobId)),
      payRef ? tx.get(payRef) : undefined,
      appRef ? tx.get(appRef) : undefined,
    ]);
    const plan = planCancel({
      role, info, workerId, job, completion: completion.data(), payment: payment?.data(), now: now(),
    });
    const userRef = plan.penalisedUid ? db.collection('users').doc(plan.penalisedUid) : null;
    const user = userRef ? await tx.get(userRef) : undefined;

    const refund = plan.refund && payRef;
    if (role === 'poster') {
      tx.update(jobRef, {
        status: 'cancelled', cancelledBy: 'poster', cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), ...(refund ? { paymentStatus: 'refunded' } : {}),
      });
    } else {
      tx.update(jobRef, {
        status: 'open', assignedTo: [], applicants: FieldValue.arrayRemove(uid),
        updatedAt: FieldValue.serverTimestamp(), ...(refund ? { paymentStatus: 'refunded' } : {}),
      });
      if (appRef && application?.exists) {
        tx.update(appRef, { status: 'rejected', withdrawnByWorker: true, updatedAt: FieldValue.serverTimestamp() });
      } else {
        logger.warn('cancelJob: application not found, skipped', { jobId, workerId });
      }
    }
    if (refund) tx.update(payRef, { status: 'refunded', refundedAt: FieldValue.serverTimestamp() });

    let applied = 0;
    if (userRef && user) {
      const fields = planPenalty(user.data(), plan.points);
      if (user.exists) {
        tx.update(userRef, fields);
      } else {
        logger.warn('cancelJob: penalised user has no profile, writing a server stub', { jobId, userId: userRef.id });
        tx.set(userRef, profileStub(userRef.id, fields), { merge: true });
      }
      applied = plan.points;
    }

    logger.info('cancelJob', { jobId, role, reason });
    return {
      result: { penaltyPoints: applied, status: plan.next } satisfies CancelJobResult,
      notify: role === 'worker' ? { poster: info.postedBy, title: info.title, workerId: uid } : null,
    };
  });

  if (notify) {
    try {
      await writeNotification(db, {
        userId: notify.poster,
        type: 'worker_cancelled',
        message: messages.workerCancelled(notify.title),
        extras: { jobId, jobTitle: safeTitle(notify.title) },
        sourceId: `${jobId}_${notify.workerId}`,
      });
    } catch (error) {
      logger.error('cancelJob: notification failed after commit', { jobId, error });
    }
  }
  return result;
}
