export type MemberRole = 'poster' | 'worker';

/** The fields of a `jobs/{jobId}` document that decide membership. */
export interface JobMembership {
  postedBy: string;
  assignedTo?: string[];
}

/** Keep identical to unijob-web/src/types/notification.ts (type parity test in tests/unit/parity.test.ts). */
export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'job_completed'
  | 'job_cancelled'
  | 'deadline_expired'
  | 'completion_requested'
  | 'job_invite';
