import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { MSG_JOB_NOT_FOUND } from '../lib/auth.js';
import type { AuthNameOf } from '../lib/authName.js';
import { FALLBACK_POSTER_NAME, isDocId, toJobInfo } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

export interface SendJobInviteResult {
  sent: boolean;
}

export const INVITE_MSG = {
  invalid: 'Lời mời không hợp lệ.',
  self: 'Bạn không thể tự mời chính mình.',
  notPoster: 'Chỉ người đăng việc mới gửi được lời mời.',
  notOpen: 'Công việc này không còn nhận ứng viên.',
  workerNotFound: 'Không tìm thấy người được mời.',
} as const;

/** Label shown instead of the poster's name on anonymous jobs (same text the web client writes). */
export const ANONYMOUS_NAME = 'Ẩn danh';

/**
 * Sender name, derived on the server: 'Ẩn danh' for anonymous jobs, otherwise the caller's Firebase
 * Auth name. Never job.postedByName or users/{uid}.displayName: the client writes both freely, so a
 * poster could sign server notifications as e.g. "Phòng Đào tạo HCMUT". A legacy job without
 * `isAnonymous` but labelled 'Ẩn danh' stays anonymous, so the poster's name is never revealed.
 */
async function senderName(uid: string, job: Record<string, unknown>, authNameOf: AuthNameOf): Promise<string> {
  if (job.isAnonymous === true || job.postedByName === ANONYMOUS_NAME) return ANONYMOUS_NAME;
  return (await authNameOf(uid)) || FALLBACK_POSTER_NAME;
}

/** The poster of an open job invites a worker. One invite per worker per job. */
export async function handleSendJobInvite(
  db: Firestore,
  uid: string,
  data: unknown,
  authNameOf: AuthNameOf,
): Promise<SendJobInviteResult> {
  const { jobId, workerId } = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (!isDocId(jobId) || !isDocId(workerId)) throw new HttpsError('invalid-argument', INVITE_MSG.invalid);
  if (workerId === uid) throw new HttpsError('invalid-argument', INVITE_MSG.self);
  const jobData = (await db.collection('jobs').doc(jobId).get()).data();
  const job = toJobInfo(jobId, jobData);
  if (!job || !jobData) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
  if (job.postedBy !== uid) throw new HttpsError('permission-denied', INVITE_MSG.notPoster);
  if (job.status !== 'open') throw new HttpsError('failed-precondition', INVITE_MSG.notOpen);
  if (!(await db.collection('users').doc(workerId).get()).exists) {
    throw new HttpsError('not-found', INVITE_MSG.workerNotFound);
  }
  const fromName = await senderName(uid, jobData, authNameOf);
  const sent = await writeNotification(db, {
    userId: workerId,
    type: 'job_invite',
    message: messages.jobInvite(fromName, job.title),
    extras: { jobId, jobTitle: job.title, fromName },
    sourceId: `${jobId}_${workerId}`,
  });
  return { sent };
}
