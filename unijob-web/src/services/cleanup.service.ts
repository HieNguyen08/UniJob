import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createNotification } from '@/services/notification.service';
import type { Job } from '@/types';

/**
 * Marks all open jobs with a passed deadline as 'cancelled'
 * and notifies the poster of each expired job.
 *
 * NOTE: This runs client-side on auth. For production, move to a
 * Firebase Cloud Function scheduled with Cloud Scheduler.
 *
 * Firestore rules must allow authenticated users to update jobs
 * where deadline < now && status == 'open', or restrict to admin role.
 */
export async function cleanupExpiredJobs(): Promise<number> {
  const jobsCollection = collection(db, 'jobs');
  const now = Timestamp.now();

  const q = query(
    jobsCollection,
    where('status', '==', 'open'),
    where('deadline', '<', now)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  const notificationPromises: Promise<void>[] = [];

  snapshot.docs.forEach((d) => {
    const job = { id: d.id, ...d.data() } as Job;

    batch.update(doc(db, 'jobs', d.id), {
      status: 'cancelled',
      updatedAt: now,
    });

    if (job.postedBy) {
      notificationPromises.push(
        createNotification(
          job.postedBy,
          'deadline_expired',
          `⏰ Công việc "${job.title}" đã hết hạn và được đóng tự động.`,
          { jobId: job.id, jobTitle: job.title }
        )
      );
    }
  });

  await batch.commit();
  await Promise.allSettled(notificationPromises);

  return snapshot.docs.length;
}
