import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { AuthNameOf } from '../lib/authName.js';
import { FALLBACK_APPLICANT_NAME, FALLBACK_JOB_TITLE, isDocId, readJob } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * applications/{appId} created -> new_application to the job's poster. The applicant's name comes
 * from Firebase Auth, never from the client-written applicantName.
 */
export async function handleApplicationCreated(
  db: Firestore,
  appId: string,
  app: DocumentData | undefined,
  authNameOf: AuthNameOf,
): Promise<boolean> {
  if (!app) return false;
  const applicantId = str(app.applicantId);
  if (!applicantId) return false;
  const job = await readJob(db, app.jobId);
  if (!job || !job.postedBy) {
    logger.warn('new_application: job not found, no notification', { appId });
    return false;
  }
  if (job.postedBy === applicantId) return false;
  const name = (await authNameOf(applicantId)) || FALLBACK_APPLICANT_NAME;
  return writeNotification(db, {
    userId: job.postedBy,
    type: 'new_application',
    message: messages.newApplication(name, job.title),
    extras: { jobId: job.id, jobTitle: job.title, fromName: name },
    sourceId: appId,
  });
}

/** applications/{appId} pending -> accepted|rejected -> notify the applicant. */
export async function handleApplicationUpdated(
  db: Firestore,
  appId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<boolean> {
  if (!before || !after || before.status !== 'pending') return false;
  const status = after.status;
  if (status !== 'accepted' && status !== 'rejected') return false;
  const applicantId = str(after.applicantId);
  if (!applicantId) return false;
  const jobId = isDocId(after.jobId) ? after.jobId : undefined;
  const job = await readJob(db, jobId);
  const title = job?.title ?? FALLBACK_JOB_TITLE;
  return writeNotification(db, {
    userId: applicantId,
    type: status === 'accepted' ? 'application_accepted' : 'application_rejected',
    message: status === 'accepted' ? messages.applicationAccepted(title) : messages.applicationRejected(title),
    extras: { jobId, jobTitle: title },
    sourceId: appId,
  });
}
