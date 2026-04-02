import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/lib/firebase';
import type { User } from '@/types';

/**
 * Sign in with Google (restricted to school email)
 */
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Check if user profile exists, if not create one
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser: Omit<User, 'createdAt' | 'updatedAt'> = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      faculty: '',
      department: '',
      studentId: '',
      phone: '',
      bio: '',
      skills: [],
      ratingScore: 0,
      totalRatings: 0,
      activeJobCount: 0,
      maxJobLimit: 2, // Default for new users
      isAnonymous: false,
    };

    await setDoc(userRef, {
      ...newUser,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return user;
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/**
 * Listen to auth state changes
 */
export function onAuthChanged(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user profile from Firestore
 */
export async function getCurrentUserProfile(uid: string): Promise<User | null> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return { uid: userSnap.id, ...userSnap.data() } as User;
  }
  return null;
}
