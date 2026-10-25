import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  COMPLETION_VERSION, completionParties, isTrustedCompletion, nextCompletionStep, parseCompletionInput, planWorkHistory, workHistoryIdFor,
  type ConfirmCompletionResult,
} from '../lib/completion.js';

/**
 * The poster or the assigned worker records their confirmation. When both sides have confirmed, the completion is
 * `confirmed`, the job `completed` and the work history written, in the same transaction (Decision 3 of
 * docs/plans/2026-10-25-server-completion.md). A completion doc without the server marker is untrusted (it may
 * be forged): it is treated as absent and overwritten by the worker's confirmation.
 */
export async function handleConfirmCompletion(db: Firestore, uid: string, data: unknown): Promise<ConfirmCompletionResult> {
  const { jobId } = parseCompletionInput(data);
  const jobRef = db.collection('jobs').doc(jobId);
  const completionRef = db.collection('jobCompletions').doc(jobId);
  return db.runTransaction(async (tx) => {
    const jobData = (await tx.get(jobRef)).data();
    const { role, info, workerId } = completionParties(jobId, jobData, uid);
    const historyRef = db.collection('workHistory').doc(workHistoryIdFor(jobId, workerId));
    const [completionSnap, historySnap] = await Promise.all([tx.get(completionRef), tx.get(historyRef)]);
    const current = completionSnap.data();
    const trusted = isTrustedCompletion(current, jobId) ? current : undefined;
    const step = nextCompletionStep(role, current, jobId);
    if (!step.write) return step.state;

    const updatedAt = FieldValue.serverTimestamp();
    const confirmed = step.state.status === 'confirmed';
    const completedAt = trusted?.completedAt instanceof Timestamp ? trusted.completedAt : FieldValue.serverTimestamp();
    if (step.create) {
      tx.set(completionRef, {
        jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null,
        createdAt: FieldValue.serverTimestamp(), updatedAt, source: 'server', serverVersion: COMPLETION_VERSION,
      });
    } else {
      tx.update(completionRef, {
        jobId,
        [role === 'worker' ? 'workerConfirmed' : 'posterConfirmed']: true,
        updatedAt,
        ...(confirmed ? { status: 'confirmed', completedAt } : {}),
      });
    }
    if (confirmed) {
      tx.update(jobRef, { status: 'completed', updatedAt });
      // The job completes once, so the record is always (re)written; a doc already at this id was not made by us.
      if (historySnap.exists) logger.warn('Overwriting an existing workHistory doc', { jobId, workerId });
      tx.set(historyRef, { ...planWorkHistory(info, jobData ?? {}, workerId), completedAt: FieldValue.serverTimestamp() });
    }
    return step.state;
  });
}
