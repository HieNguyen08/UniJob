import {
  collection,
  setDoc,
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
import { getPaymentByJob, releasePayment } from '@/services/payment.service';

const ratingsCollection = collection(db, 'ratings');

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
  const ratingId = `${jobId}_${fromUserId}_${toUserId}`;
  const docRef = doc(db, 'ratings', ratingId);
  await setDoc(docRef, {
    jobId,
    fromUserId,
    toUserId,
    score,
    comment,
    type,
    createdAt: serverTimestamp(),
  });

  // Update user's average rating. Slice 6 moves this aggregate server-side;
  // until then the users rule may deny it, which must not fail the saved rating.
  // Note: getRatingsByUser already includes the newly added doc above
  try {
    const userRatings = await getRatingsByUser(toUserId);
    const totalScore = userRatings.reduce((sum, r) => sum + r.score, 0);
    const avgRating = totalScore / userRatings.length;

    const userRef = doc(db, 'users', toUserId);
    await updateDoc(userRef, {
      ratingScore: Math.round(avgRating * 10) / 10,
      totalRatings: userRatings.length,
    });
  } catch (err) {
    console.warn('Không cập nhật được điểm trung bình (sẽ do server xử lý):', err);
  }

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
 * Create the job's completion record (2-step confirmation). Each job has exactly one, at
 * jobCompletions/{jobId} (enforced by the rules); an existing record is reused, never reset.
 */
export async function createJobCompletion(jobId: string): Promise<string> {
  const completionRef = doc(db, 'jobCompletions', jobId);
  const existing = await getDoc(completionRef);
  if (existing.exists()) return jobId;
  await setDoc(completionRef, {
    jobId,
    workerConfirmed: false,
    posterConfirmed: false,
    completedAt: null,
    status: 'pending',
  });
  return jobId;
}

/**
 * Confirm job completion (worker or poster)
 */
export async function confirmCompletion(
  completionId: string,
  role: 'worker' | 'poster'
): Promise<void> {
  // Thông báo (completion_requested, job_completed) do Cloud Functions gửi.
  const completionRef = doc(db, 'jobCompletions', completionId);
  const compSnap = await getDoc(completionRef);
  if (!compSnap.exists()) return;

  const compData = compSnap.data() as JobCompletion;
  const field = role === 'worker' ? 'workerConfirmed' : 'posterConfirmed';

  const isBothConfirmed = role === 'worker'
    ? compData.posterConfirmed
    : compData.workerConfirmed;

  const updates: Record<string, unknown> = { [field]: true };
  if (isBothConfirmed) {
    updates.status = 'confirmed';
    updates.completedAt = serverTimestamp();
  }

  await updateDoc(completionRef, updates);

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
    }
  }
}

/**
 * Get the completion record for a job (jobCompletions/{jobId}). Only the poster and the assigned
 * worker may read it; for anyone else the rules deny the get, which means "no completion for you".
 */
export async function getJobCompletion(jobId: string): Promise<JobCompletion | null> {
  let docSnap;
  try {
    docSnap = await getDoc(doc(db, 'jobCompletions', jobId));
  } catch (err) {
    if ((err as { code?: unknown }).code === 'permission-denied') return null;
    throw err;
  }
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as JobCompletion;
}
