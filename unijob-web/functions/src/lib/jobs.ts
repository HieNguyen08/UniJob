import type { Firestore } from 'firebase-admin/firestore';

export const FALLBACK_JOB_TITLE = 'công việc';
export const FALLBACK_APPLICANT_NAME = 'Một ứng viên';
export const FALLBACK_POSTER_NAME = 'Người đăng việc';

/** The fields of jobs/{jobId} the notification handlers need, normalised. */
export interface JobInfo {
  id: string;
  title: string;
  postedBy: string;
  postedByName: string;
  assignedTo: string[];
  status: string;
}

const MAX_ID_BYTES = 700; // leaves room for `${type}_${a}_${b}` under Firestore's 1500-byte id limit

/** A string usable as one Firestore document id segment. */
export function isDocId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    !id.includes('/') &&
    id !== '.' &&
    id !== '..' &&
    !/^__.*__$/.test(id) &&
    Buffer.byteLength(id, 'utf8') <= MAX_ID_BYTES
  );
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function toJobInfo(id: string, data: Record<string, unknown> | undefined): JobInfo | null {
  if (!data) return null;
  const assignedTo = Array.isArray(data.assignedTo)
    ? data.assignedTo.filter((uid): uid is string => typeof uid === 'string' && uid !== '')
    : [];
  return {
    id,
    title: str(data.title).trim() ? str(data.title) : FALLBACK_JOB_TITLE,
    postedBy: str(data.postedBy),
    postedByName: str(data.postedByName),
    assignedTo,
    status: str(data.status),
  };
}

/** jobs/{jobId}, or null if the id is unusable or the job does not exist. */
export async function readJob(db: Firestore, jobId: unknown): Promise<JobInfo | null> {
  if (!isDocId(jobId)) return null;
  const snap = await db.collection('jobs').doc(jobId).get();
  return snap.exists ? toJobInfo(jobId, snap.data()) : null;
}
