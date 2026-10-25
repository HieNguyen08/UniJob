import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { readJob } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

/**
 * jobCompletions/{completionId}: the worker's confirmation flips to true while the poster has not
 * confirmed -> completion_requested to the poster.
 *
 * There is one completion doc per job and its id is the jobId (enforced by the rules in 3b). A doc
 * under any other id is forged or legacy and is skipped (defence in depth).
 *
 * sourceId is the jobId, not the completion id: until slice 5 any signed-in user can write
 * jobCompletions, so keying by job caps forged-document spam at one request per job.
 */
export async function handleCompletionWritten(
  db: Firestore,
  completionId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<boolean> {
  if (!after) return false;
  const workerJustConfirmed = after.workerConfirmed === true && before?.workerConfirmed !== true;
  if (!workerJustConfirmed || after.posterConfirmed === true) return false;
  if (after.jobId !== completionId) {
    logger.warn('completion_requested: completion id is not its jobId, skipped', { completionId });
    return false;
  }
  const job = await readJob(db, after.jobId);
  if (!job || !job.postedBy || job.status !== 'in-progress' || job.assignedTo.length === 0) {
    logger.info('completion_requested: job not in progress with a worker, skipped', { completionId });
    return false;
  }
  return writeNotification(db, {
    userId: job.postedBy,
    type: 'completion_requested',
    message: messages.completionRequested(job.title),
    extras: { jobId: job.id, jobTitle: job.title },
    sourceId: job.id,
  });
}
