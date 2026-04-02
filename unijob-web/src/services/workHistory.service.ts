import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  or,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface WorkHistoryEntry {
  id: string;
  user1: string;
  user2: string;
  jobId: string;
  completedAt: Timestamp;
}

const workHistoryCollection = collection(db, 'workHistory');

/**
 * Record a completed collaboration between poster and worker
 */
export async function recordWorkHistory(
  posterId: string,
  workerId: string,
  jobId: string
): Promise<string> {
  const docRef = await addDoc(workHistoryCollection, {
    user1: posterId,
    user2: workerId,
    jobId,
    completedAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Get all past collaborators for a user
 */
export async function getWorkHistory(userId: string): Promise<WorkHistoryEntry[]> {
  const q = query(
    workHistoryCollection,
    or(where('user1', '==', userId), where('user2', '==', userId))
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as WorkHistoryEntry[];
}

/**
 * Check if two users have worked together before
 */
export async function haveWorkedTogether(userId1: string, userId2: string): Promise<boolean> {
  const q = query(workHistoryCollection, where('user1', '==', userId1), where('user2', '==', userId2));
  const q2 = query(workHistoryCollection, where('user1', '==', userId2), where('user2', '==', userId1));
  const [s1, s2] = await Promise.all([getDocs(q), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}
