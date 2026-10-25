import type { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'job_completed'
  | 'job_cancelled'
  | 'deadline_expired'
  | 'completion_requested'
  | 'job_invite'
  | 'payment_disputed';

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

/** Response of the sendJobInvite callable (unijob-web/functions/src/handlers/invites.ts). */
export interface SendJobInviteResult {
  sent: boolean;
}
