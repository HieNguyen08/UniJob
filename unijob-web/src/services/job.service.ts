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
  const docRef = await addDoc(applicationsCollection, {
    jobId,
    applicantId,
    applicantName,
    applicantPhoto,
    message,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
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
 */
export async function updateApplicationStatus(
  applicationId: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  const appRef = doc(db, 'applications', applicationId);
  await updateDoc(appRef, {
    status,
    updatedAt: serverTimestamp(),
  });
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
