import type { DocumentData } from 'firebase-admin/firestore';
import { isDocId } from './jobs.js';

/** jobCounters/{jobId}: who this job is currently counted for (plan 2026-10-25-server-reputation, Decision 3). */
export interface CounterMarker {
  activeWorker: string | null;
  completedWorker: string | null;
}

const firstAssignee = (job: DocumentData | undefined): unknown =>
  Array.isArray(job?.assignedTo) ? job.assignedTo[0] : undefined;

/** True when the status or the first assignee differs between before and after. */
export function countersRelevant(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!before || !after) return false;
  return before.status !== after.status || firstAssignee(before) !== firstAssignee(after);
}

const markerUid = (v: unknown): string | null => (isDocId(v) ? v : null);

/**
 * Reconciles the counters from the job's current state against its marker. `null` = nothing to change.
 * The decrement for the previous worker comes before the increment for the new one.
 */
export function planCounters(
  jobId: string,
  job: DocumentData | undefined,
  marker: DocumentData | undefined,
): { next: CounterMarker; active: Array<{ uid: string; delta: 1 | -1 }>; completed: string | null } | null {
  void jobId;
  if (!job) return null;
  const worker = firstAssignee(job);
  const validWorker = isDocId(worker) && worker !== job.postedBy ? worker : null;
  const desiredActive = job.status === 'in-progress' ? validWorker : null;
  const oldActive = markerUid(marker?.activeWorker);
  const oldCompleted = markerUid(marker?.completedWorker);

  const active: Array<{ uid: string; delta: 1 | -1 }> = [];
  if (oldActive !== desiredActive) {
    if (oldActive) active.push({ uid: oldActive, delta: -1 });
    if (desiredActive) active.push({ uid: desiredActive, delta: 1 });
  }
  const completed = job.status === 'completed' && validWorker && !oldCompleted ? validWorker : null;
  if (active.length === 0 && !completed) return null;
  return { next: { activeWorker: desiredActive, completedWorker: completed ?? oldCompleted }, active, completed };
}
