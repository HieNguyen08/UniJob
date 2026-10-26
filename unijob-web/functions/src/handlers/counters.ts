import { logger } from 'firebase-functions';
import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { countersRelevant, planCounters } from '../lib/counters.js';
import { profileStub } from '../lib/profileStub.js';

/** Same rule as currentCount in lib/reputation.ts: a non-negative integer, else 0. */
const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

/**
 * Keeps activeJobCount / completedJobs on users/{uid} (plan 2026-10-25-server-reputation, Decision 3).
 * Reconciles from the job's CURRENT state against jobCounters/{jobId}, not from the event, so redelivery and
 * out-of-order events never double count. A missing profile gets a server stub (set with merge).
 */
export async function handleJobCounters(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<'updated' | 'unchanged' | 'skipped'> {
  if (!countersRelevant(before, after)) return 'skipped';
  const jobRef = db.collection('jobs').doc(jobId);
  const markerRef = db.collection('jobCounters').doc(jobId);
  return db.runTransaction(async (tx) => {
    const [job, marker] = await Promise.all([tx.get(jobRef), tx.get(markerRef)]);
    if (!job.exists) return 'skipped' as const;
    const plan = planCounters(jobId, job.data(), marker.data());
    if (!plan) return 'unchanged' as const;

    const uids = [...new Set([...plan.active.map((a) => a.uid), ...(plan.completed ? [plan.completed] : [])])];
    const refs = uids.map((uid) => db.collection('users').doc(uid));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((snap, i) => {
      const uid = uids[i];
      const delta = plan.active.filter((a) => a.uid === uid).reduce((n, a) => n + a.delta, 0);
      const completedInc = plan.completed === uid ? 1 : 0;
      const data = snap.data();
      const activeJobCount = Math.max(0, count(data?.activeJobCount) + delta);
      const completedJobs = count(data?.completedJobs) + completedInc;
      if (snap.exists) {
        const update: Record<string, number> = { activeJobCount };
        if (completedInc) update.completedJobs = completedJobs;
        tx.update(refs[i], update);
      } else {
        logger.warn('onJobCounters: user has no profile, writing a server stub', { jobId, userId: uid });
        tx.set(refs[i], profileStub(uid, { activeJobCount, completedJobs }), { merge: true });
      }
    });
    tx.set(markerRef, { ...plan.next, updatedAt: FieldValue.serverTimestamp() });
    return 'updated' as const;
  });
}
