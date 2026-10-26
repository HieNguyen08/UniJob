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
  /** ratingAverage trừ 0.1 × penaltyPoints, tối thiểu 0; do server ghi (Cloud Functions). */
  ratingScore: number;
  /** Số đánh giá nhận được; do server ghi (Cloud Functions). */
  totalRatings: number;
  /** Số job đang làm; do server ghi (Cloud Functions). */
  activeJobCount: number;
  maxJobLimit: number;
  /** Điểm trung bình các đánh giá; do server ghi (Cloud Functions). */
  ratingAverage?: number;
  /** Tổng điểm phạt uy tín; do server ghi (Cloud Functions). */
  penaltyPoints?: number;
  /** Số job đã hoàn thành; do server ghi (Cloud Functions). */
  completedJobs?: number;
  isAnonymous: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserCreateInput = Omit<User, 'createdAt' | 'updatedAt'>;

export type UserProfile = Pick<User, 'uid' | 'displayName' | 'photoURL' | 'faculty' | 'ratingScore' | 'totalRatings'>;

/** Các trường hồ sơ người dùng được phép tự sửa; uy tín và bộ đếm do server ghi. */
export type ProfileEditInput = Partial<
  Pick<User, 'displayName' | 'photoURL' | 'faculty' | 'department' | 'studentId' | 'phone' | 'bio' | 'skills' | 'isAnonymous'>
>;
