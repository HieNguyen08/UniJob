import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { User, ProfileEditInput } from '@/types';

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
// Chỉ các trường hồ sơ; uy tín và bộ đếm job do server ghi (rules chặn).
export async function updateUserProfile(userId: string, data: ProfileEditInput): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
