import type { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'job_completed';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  jobId?: string;
  jobTitle?: string;
  fromName?: string;
  read: boolean;
  createdAt: Timestamp;
}
