export type MemberRole = 'poster' | 'worker';

/** The fields of a `jobs/{jobId}` document that decide membership. */
export interface JobMembership {
  postedBy: string;
  assignedTo?: string[];
}

/**
 * Keep equal to unijob-web/src/types/notification.ts plus 'payment_disputed', which the web union gets in
 * slice 4b (Decision 7 of docs/plans/2026-10-25-server-escrow.md; parity test in tests/unit/parity.test.ts).
 */
export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'job_completed'
  | 'job_cancelled'
  | 'deadline_expired'
  | 'completion_requested'
  | 'job_invite'
  | 'payment_disputed'
  | 'worker_cancelled'; // web gets it in slice 6b (Decision 8 of docs/plans/2026-10-25-server-reputation.md)
