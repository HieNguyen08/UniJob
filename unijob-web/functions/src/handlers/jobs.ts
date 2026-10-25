import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { toJobInfo } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification, type NotificationInput } from '../lib/notifications.js';

/**
 * jobs/{jobId} status changes:
 * - -> cancelled: job_cancelled to every assigned worker (before or after the write); neutral expiry
 *   wording when the scheduler expired an open job (cancelReason 'expired').
 * - -> completed: job_completed to each assigned worker and to the poster.
 * The same type goes to several users, so sourceId is `${jobId}_${uid}`.
 */
export async function handleJobUpdated(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<number> {
  if (!before || !after || before.status === after.status) return 0;
  const was = toJobInfo(jobId, before);
  const job = toJobInfo(jobId, after);
  if (!was || !job) return 0;
  const extras = { jobId, jobTitle: job.title };
  const notMe = (uid: string) => uid !== job.postedBy;
  const inputs: NotificationInput[] = [];

  // The scheduler expired an open job: the poster gets deadline_expired from expireJobs, and assigned
  // workers get neutral expiry wording instead of "đã bị người đăng hủy". Only for open -> cancelled
  // (clients cannot write cancelReason once the 3b rules ship).
  const expired = was.status === 'open' && after.cancelReason === 'expired';

  if (job.status === 'cancelled') {
    const workers = [...new Set([...was.assignedTo, ...job.assignedTo])].filter(notMe);
    const message = expired ? messages.jobExpiredWorker(job.title) : messages.jobCancelledByPoster(job.title);
    for (const uid of workers) {
      inputs.push({ userId: uid, type: 'job_cancelled', message, extras, sourceId: `${jobId}_${uid}` });
    }
  } else if (job.status === 'completed') {
    const workers = job.assignedTo.filter(notMe);
    for (const uid of workers) {
      inputs.push({ userId: uid, type: 'job_completed', message: messages.jobCompletedWorker(job.title), extras, sourceId: `${jobId}_${uid}` });
    }
    if (workers.length > 0 && job.postedBy) {
      inputs.push({
        userId: job.postedBy,
        type: 'job_completed',
        message: messages.jobCompletedPoster(job.title),
        extras,
        sourceId: `${jobId}_${job.postedBy}`,
      });
    }
  }

  const written = await Promise.all(inputs.map((input) => writeNotification(db, input)));
  return written.filter(Boolean).length;
}
