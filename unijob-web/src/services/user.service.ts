import { doc, getDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { User } from '@/types';

/**
 * Get user profile by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return { uid: userSnap.id, ...userSnap.data() } as User;
  }
  return null;
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Increment active job count (atomic)
 */
export async function incrementActiveJobs(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    activeJobCount: increment(1),
  });
}

/**
 * Decrement active job count (atomic)
 */
export async function decrementActiveJobs(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    activeJobCount: increment(-1),
  });
}

/**
 * Check if user can accept more jobs
 */
export async function canAcceptMoreJobs(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;
  return user.activeJobCount < user.maxJobLimit;
}
