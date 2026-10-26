import {
  collection,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isServerRecord } from '@/lib/completion';
import type { Rating, JobCompletion } from '@/types';

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

  // Điểm trung bình và số đánh giá do trigger onRatingCreated (server) cập nhật.

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

// Xác nhận hoàn thành do callable confirmCompletion (completion.service) ghi; client chỉ đọc.
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
  // The server treats docs without its version marker (legacy / client-written) as absent; so does the UI.
  const data = docSnap.data();
  if (!isServerRecord(data) || data.jobId !== docSnap.id) return null;
  return { id: docSnap.id, ...docSnap.data() } as JobCompletion;
}
