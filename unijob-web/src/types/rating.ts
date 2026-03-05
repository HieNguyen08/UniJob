import type { Timestamp } from 'firebase/firestore';

export type RatingType = 'poster-to-worker' | 'worker-to-poster';

export interface Rating {
  id: string;
  jobId: string;
  fromUserId: string;
  toUserId: string;
  score: number; // 1-5
  comment: string;
  type: RatingType;
  createdAt: Timestamp;
}

export interface JobCompletion {
  id: string;
  jobId: string;
  workerConfirmed: boolean;
  posterConfirmed: boolean;
  completedAt: Timestamp | null;
  status: 'pending' | 'confirmed' | 'disputed';
}

export interface WorkHistory {
  id: string;
  user1: string;
  user2: string;
  jobId: string;
  completedAt: Timestamp;
  rating: number;
}
