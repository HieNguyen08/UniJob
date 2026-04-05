import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function toggleBookmark(userId: string, jobId: string): Promise<boolean> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return false;

  const bookmarks: string[] = userSnap.data().bookmarks ?? [];
  const isBookmarked = bookmarks.includes(jobId);

  await updateDoc(userRef, {
    bookmarks: isBookmarked ? arrayRemove(jobId) : arrayUnion(jobId),
  });

  return !isBookmarked; // return new state
}

export async function getBookmarkedJobIds(userId: string): Promise<string[]> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return [];
  return (userSnap.data().bookmarks as string[]) ?? [];
}
