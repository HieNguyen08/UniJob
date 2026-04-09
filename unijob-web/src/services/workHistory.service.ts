import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  or,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserById } from '@/services/user.service';
import type { Job } from '@/types/job';

export interface WorkHistoryEntry {
  id: string;
  user1: string;
  user2: string;
  jobId: string;
  jobTitle: string;
  category: string;
  completedAt: Timestamp;
}

export interface PastCollaboration {
  jobId: string;
  jobTitle: string;
  category: string;
  completedAt: Date | null;
  ratingScore: number;
}

export interface SmartMatchWorker {
  uid: string;
  displayName: string;
  photoURL: string;
  faculty: string;
  ratingScore: number;
  totalRatings: number;
  collaborationCount: number;
  pastWork: PastCollaboration[];
}

const workHistoryCollection = collection(db, 'workHistory');

/**
 * Record a completed collaboration between poster and worker
 */
export async function recordWorkHistory(
  posterId: string,
  workerId: string,
  jobId: string,
  jobTitle: string,
  category: string
): Promise<string> {
  const docRef = await addDoc(workHistoryCollection, {
    user1: posterId,
    user2: workerId,
    jobId,
    jobTitle,
    category,
    completedAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Get all past collaborators for a user
 */
export async function getWorkHistory(userId: string): Promise<WorkHistoryEntry[]> {
  const q = query(
    workHistoryCollection,
    or(where('user1', '==', userId), where('user2', '==', userId))
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as WorkHistoryEntry[];
}

/**
 * Check if two users have worked together before
 */
export async function haveWorkedTogether(userId1: string, userId2: string): Promise<boolean> {
  const q = query(workHistoryCollection, where('user1', '==', userId1), where('user2', '==', userId2));
  const q2 = query(workHistoryCollection, where('user1', '==', userId2), where('user2', '==', userId1));
  const [s1, s2] = await Promise.all([getDocs(q), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}

/**
 * Smart Matching: find workers who have successfully collaborated with the poster.
 *
 * Primary source: /workHistory/ collection entries where user1 = posterId.
 * Fallback: completed jobs posted by the poster (uses existing assignedTo data).
 *
 * Scoring:
 *  - collaborationCount: number of past jobs together (desc)
 *  - ratingScore >= 4 required
 *  - sorted by collaborationCount desc, ratingScore desc
 *  - max 5 results
 */
export async function getSmartMatchedWorkers(posterId: string): Promise<SmartMatchWorker[]> {
  // ── Primary: workHistory collection ──
  const whQuery = query(workHistoryCollection, where('user1', '==', posterId));
  const whSnapshot = await getDocs(whQuery);
  const whEntries = whSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WorkHistoryEntry[];

  // ── Fallback: completed jobs from Firestore ──
  const jobsRef = collection(db, 'jobs');
  const jobQuery = query(
    jobsRef,
    where('postedBy', '==', posterId),
    where('status', '==', 'completed'),
    orderBy('createdAt', 'desc')
  );
  const jobSnapshot = await getDocs(jobQuery);
  const completedJobs = jobSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Job[];

  // Build workerJobMap from whichever source has data
  const workerJobMap = new Map<string, Array<{ jobId: string; jobTitle: string; category: string; completedAt: Date | null }>>();

  if (whEntries.length > 0) {
    // Use workHistory collection
    for (const entry of whEntries) {
      const workerId = entry.user2;
      if (workerId === posterId) continue;
      if (!workerJobMap.has(workerId)) workerJobMap.set(workerId, []);
      workerJobMap.get(workerId)!.push({
        jobId: entry.jobId,
        jobTitle: entry.jobTitle ?? '',
        category: entry.category ?? '',
        completedAt: entry.completedAt?.toDate?.() ?? null,
      });
    }
  } else if (completedJobs.length > 0) {
    // Fallback: derive from jobs collection
    for (const job of completedJobs) {
      for (const workerId of job.assignedTo ?? []) {
        if (workerId === posterId) continue;
        if (!workerJobMap.has(workerId)) workerJobMap.set(workerId, []);
        workerJobMap.get(workerId)!.push({
          jobId: job.id,
          jobTitle: job.title,
          category: job.category,
          completedAt: job.updatedAt?.toDate?.() ?? null,
        });
      }
    }
  }

  if (workerJobMap.size === 0) return [];

  // Fetch profiles and filter
  const results = await Promise.all(
    Array.from(workerJobMap.entries()).map(async ([uid, entries]) => {
      const user = await getUserById(uid);
      if (!user || (user.ratingScore ?? 0) < 4) return null;

      const pastWork: PastCollaboration[] = entries.slice(0, 3).map((e) => ({
        jobId: e.jobId,
        jobTitle: e.jobTitle,
        category: e.category,
        completedAt: e.completedAt,
        ratingScore: user.ratingScore,
      }));

      return {
        uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        faculty: user.faculty,
        ratingScore: user.ratingScore,
        totalRatings: user.totalRatings,
        collaborationCount: entries.length,
        pastWork,
      } satisfies SmartMatchWorker;
    })
  );

  const workers = results.filter((w): w is SmartMatchWorker => w !== null);
  workers.sort(
    (a, b) => b.collaborationCount - a.collaborationCount || b.ratingScore - a.ratingScore
  );
  return workers.slice(0, 5);
}
