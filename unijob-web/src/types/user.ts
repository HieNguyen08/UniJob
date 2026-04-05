import type { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  faculty: string;
  department: string;
  studentId: string;
  phone: string;
  bio: string;
  skills: string[];
  bookmarks: string[];
  ratingScore: number;
  totalRatings: number;
  activeJobCount: number;
  maxJobLimit: number;
  isAnonymous: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserCreateInput = Omit<User, 'createdAt' | 'updatedAt'>;

export interface UserProfile extends Pick<User, 'uid' | 'displayName' | 'photoURL' | 'faculty' | 'ratingScore' | 'totalRatings'> {}
