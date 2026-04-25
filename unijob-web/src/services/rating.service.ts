import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Rating, JobCompletion } from '@/types';
import { recordWorkHistory } from '@/services/workHistory.service';
import { getJobById, updateJob } from '@/services/job.service';
import { createNotification } from '@/services/notification.service';
import { getPaymentByJob, releasePayment } from '@/services/payment.service';

const ratingsCollection = collection(db, 'ratings');
const completionsCollection = collection(db, 'jobCompletions');

/**
 * Submit a rating
 */
export async function submitRating(
  jobId: string,
  fromUserId: string,
  toUserId: string,
  score: number,
  comment: string,
  type: 'poster-to-worker' | 'worker-to-poster'
): Promise<string> {
  const docRef = await addDoc(ratingsCollection, {
    jobId,
    fromUserId,
    toUserId,
    score,
    comment,
    type,
    createdAt: serverTimestamp(),
  });

  // Update user's average rating
  // Note: getRatingsByUser already includes the newly added doc above
  const userRatings = await getRatingsByUser(toUserId);
  const totalScore = userRatings.reduce((sum, r) => sum + r.score, 0);
  const avgRating = totalScore / userRatings.length;

  const userRef = doc(db, 'users', toUserId);
  await updateDoc(userRef, {
    ratingScore: Math.round(avgRating * 10) / 10,
    totalRatings: userRatings.length,
  });

  return docRef.id;
}

/**
 * Get ratings for a user
 */
export async function getRatingsByUser(userId: string): Promise<Rating[]> {
  const q = query(ratingsCollection, where('toUserId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Rating[];
}

/**
 * Create job completion record (2-step confirmation)
 */
export async function createJobCompletion(jobId: string): Promise<string> {
  const docRef = await addDoc(completionsCollection, {
    jobId,
    workerConfirmed: false,
    posterConfirmed: false,
    completedAt: null,
    status: 'pending',
  });
  return docRef.id;
}

/**
 * Confirm job completion (worker or poster)
 */
export async function confirmCompletion(
  completionId: string,
  role: 'worker' | 'poster'
): Promise<void> {
  const completionRef = doc(db, 'jobCompletions', completionId);
  const compSnap = await getDoc(completionRef);
  if (!compSnap.exists()) return;

  const compData = compSnap.data() as JobCompletion;
  const field = role === 'worker' ? 'workerConfirmed' : 'posterConfirmed';

  const isBothConfirmed = role === 'worker'
    ? compData.posterConfirmed
    : compData.workerConfirmed;

  const updates: any = { [field]: true };
  if (isBothConfirmed) {
    updates.status = 'confirmed';
    updates.completedAt = serverTimestamp();
  }

  await updateDoc(completionRef, updates);

  // Notify poster when worker submits completion
  if (role === 'worker' && !isBothConfirmed) {
    try {
      const job = await getJobById(compData.jobId);
      if (job?.postedBy) {
        await createNotification(
          job.postedBy,
          'completion_requested',
          `📋 Người làm đã báo cáo hoàn thành "${job.title}". Vui lòng kiểm tra và xác nhận.`,
          { jobId: compData.jobId, jobTitle: job.title }
        );
      }
    } catch { /* non-critical */ }
  }

  if (isBothConfirmed) {
    // Lưu work history
    const job = await getJobById(compData.jobId);
    if (job && job.assignedTo && job.assignedTo.length > 0) {
      await recordWorkHistory(job.postedBy, job.assignedTo[0], job.id, job.title, job.category);
      await updateJob(job.id, { status: 'completed' });

      // Tự động giải phóng tiền ký quỹ cho worker
      try {
        const payment = await getPaymentByJob(job.id);
        if (payment && (payment.status === 'held' || payment.status === 'pending')) {
          await releasePayment(payment.id);
        }
      } catch { /* non-critical */ }

      // Notify both parties
      try {
        await createNotification(
          job.assignedTo[0],
          'job_completed',
          `🎉 Công việc "${job.title}" đã hoàn thành! Hãy để lại đánh giá.`,
          { jobId: job.id, jobTitle: job.title }
        );
        await createNotification(
          job.postedBy,
          'job_completed',
          `✅ Công việc "${job.title}" đã được xác nhận hoàn thành.`,
          { jobId: job.id, jobTitle: job.title }
        );
      } catch { /* non-critical */ }
    }
  }
}

/**
 * Get completion record for a job
 */
export async function getJobCompletion(jobId: string): Promise<JobCompletion | null> {
  const q = query(completionsCollection, where('jobId', '==', jobId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as JobCompletion;
}
