import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Job, JobCreateInput, JobFilter, Application } from '@/types';
import { ITEMS_PER_PAGE } from '@/lib/constants';
const jobsCollection = collection(db, 'jobs');
const applicationsCollection = collection(db, 'applications');

/**
 * Create a new job
 */
export async function createJob(jobData: JobCreateInput): Promise<string> {
  const docRef = await addDoc(jobsCollection, {
    ...jobData,
    status: 'open',
    applicants: [],
    assignedTo: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Get a job by ID
 */
export async function getJobById(jobId: string): Promise<Job | null> {
  const jobRef = doc(db, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  if (jobSnap.exists()) {
    return { id: jobSnap.id, ...jobSnap.data() } as Job;
  }
  return null;
}

/**
 * Get jobs with filters and pagination
 */
export async function getJobs(
  filters: JobFilter = {},
  pageSize: number = ITEMS_PER_PAGE,
  lastDoc?: DocumentData
): Promise<Job[]> {
  const constraints: QueryConstraint[] = [];

  // Apply filters
  if (filters.category) {
    constraints.push(where('category', '==', filters.category));
  }
  if (filters.faculty) {
    constraints.push(where('faculty', '==', filters.faculty));
  }
  if (filters.isUrgent !== undefined) {
    constraints.push(where('isUrgent', '==', filters.isUrgent));
  }
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.paymentType) {
    constraints.push(where('paymentType', '==', filters.paymentType));
  }

  // Sort
  switch (filters.sortBy) {
    case 'oldest':
      constraints.push(orderBy('createdAt', 'asc'));
      break;
    case 'payment-high':
      constraints.push(orderBy('payment', 'desc'));
      break;
    case 'payment-low':
      constraints.push(orderBy('payment', 'asc'));
      break;
    default:
      constraints.push(orderBy('createdAt', 'desc'));
  }

  // Pagination
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }
  constraints.push(limit(pageSize));

  const q = query(jobsCollection, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Job[];
}

/**
 * Get jobs by user (posted by)
 */
export async function getJobsByUser(userId: string): Promise<Job[]> {
  const q = query(jobsCollection, where('postedBy', '==', userId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Job[];
}

/**
 * Update a job
 */
export async function updateJob(jobId: string, data: Partial<Job>): Promise<void> {
  const jobRef = doc(db, 'jobs', jobId);
  await updateDoc(jobRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string): Promise<void> {
  const jobRef = doc(db, 'jobs', jobId);
  await deleteDoc(jobRef);
}

export const ALREADY_APPLIED_MESSAGE = 'Bạn đã ứng tuyển công việc này rồi';

/**
 * Whether the user already has an application for the job
 */
export async function hasAppliedToJob(jobId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'applications', `${jobId}_${userId}`));
  return snap.exists();
}

/**
 * Apply for a job
 */
export async function applyForJob(
  jobId: string,
  applicantId: string,
  applicantName: string,
  applicantPhoto: string,
  message: string
): Promise<string> {
  const applicationId = `${jobId}_${applicantId}`;
  const appRef = doc(db, 'applications', applicationId);
  if ((await getDoc(appRef)).exists()) {
    throw new Error(ALREADY_APPLIED_MESSAGE);
  }
  // Atomic: đơn ứng tuyển + applicants của job cùng thành công hoặc cùng thất bại
  const batch = writeBatch(db);
  batch.set(appRef, {
    jobId,
    applicantId,
    applicantName,
    applicantPhoto,
    message,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'jobs', jobId), {
    applicants: arrayUnion(applicantId),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return applicationId;
}

/**
 * Get applications for a job
 */
export async function getApplicationsByJob(jobId: string): Promise<Application[]> {
  const q = query(applicationsCollection, where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Application[];
}

/**
 * Get applications by user
 */
export async function getApplicationsByUser(userId: string): Promise<Application[]> {
  const q = query(applicationsCollection, where('applicantId', '==', userId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Application[];
}

/**
 * Update application status
 * Accept: the escrow is held server-side when the job moves open -> in-progress (separate retried trigger), not by this write.
 */
export async function updateApplicationStatus(
  applicationId: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  await updateDoc(doc(db, 'applications', applicationId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Max other applications rejected in the accept batch (Firestore batches allow 500 writes). */
export const MAX_REJECTS_PER_ACCEPT = 450;

/**
 * Accept an applicant atomically: the application becomes accepted, the job is
 * assigned + moved to in-progress, and every other pending application is rejected,
 * all in one batch (rules only allow decisions while the job is still open).
 * Notifications are created by Cloud Functions; the escrow record is created server-side when the job moves open -> in-progress.
 */
export async function acceptApplication(
  jobId: string,
  applicationId: string,
  applicantId: string,
  otherPendingApplicationIds: string[] = []
): Promise<void> {
  const others = [...new Set(otherPendingApplicationIds)].filter((id) => id !== applicationId);
  if (others.length > MAX_REJECTS_PER_ACCEPT) {
    throw new Error(
      `Không thể từ chối hơn ${MAX_REJECTS_PER_ACCEPT} đơn khác trong một lần chấp nhận (có ${others.length}).`
    );
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'applications', applicationId), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'jobs', jobId), {
    assignedTo: [applicantId],
    status: 'in-progress',
    updatedAt: serverTimestamp(),
  });
  for (const id of others) {
    batch.update(doc(db, 'applications', id), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Subscribe to real-time updates for jobs the user posted
 * Returns an unsubscribe function — call it in useEffect cleanup
 */
export function subscribeToMyPostedJobs(
  userId: string,
  onUpdate: (jobs: Job[]) => void
): () => void {
  const q = query(jobsCollection, where('postedBy', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Job[];
    onUpdate(jobs);
  });
}

/**
 * Subscribe to real-time updates on applications for a specific job
 */
export function subscribeToJobApplications(
  jobId: string,
  onUpdate: (apps: Application[]) => void
): () => void {
  const q = query(applicationsCollection, where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Application[];
    onUpdate(apps);
  });
}
