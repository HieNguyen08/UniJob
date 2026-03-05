import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Rating, JobCompletion } from '@/types';

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
  const userRatings = await getRatingsByUser(toUserId);
  const totalScore = userRatings.reduce((sum, r) => sum + r.score, 0) + score;
  const avgRating = totalScore / (userRatings.length + 1);

  const userRef = doc(db, 'users', toUserId);
  await updateDoc(userRef, {
    ratingScore: Math.round(avgRating * 10) / 10,
    totalRatings: userRatings.length + 1,
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
  const field = role === 'worker' ? 'workerConfirmed' : 'posterConfirmed';

  await updateDoc(completionRef, {
    [field]: true,
  });
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
