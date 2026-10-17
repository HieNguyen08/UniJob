import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { JobMembership, MemberRole } from './types.js';

export const MSG_UNAUTHENTICATED = 'Bạn cần đăng nhập để thực hiện thao tác này.';
export const MSG_NOT_MEMBER = 'Bạn không có quyền thực hiện thao tác này với công việc này.';
export const MSG_JOB_NOT_FOUND = 'Không tìm thấy công việc.';

/** uid of the signed-in caller, or HttpsError('unauthenticated'). */
export function requireAuth(request: Pick<CallableRequest<unknown>, 'auth'>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', MSG_UNAUTHENTICATED);
  return uid;
}

/** The caller's role on the job: poster wins if listed twice. Applicants who are not assigned are not members. */
export function assertMember(job: JobMembership | undefined, uid: string): MemberRole {
  if (!job) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
  if (!uid) throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
  if (job.postedBy === uid) return 'poster';
  if (Array.isArray(job.assignedTo) && job.assignedTo.includes(uid)) return 'worker';
  throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
}
