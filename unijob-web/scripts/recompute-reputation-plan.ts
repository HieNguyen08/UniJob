// Pure planning for scripts/recompute-reputation.mjs (plan 2026-10-25-server-reputation, Decision 10).
// functions/src/lib/reputation.ts has no imports on purpose, so plain Node can load it from here.
import { aggregateRatings, currentCount, reputationScore, type RatingDoc } from '../functions/src/lib/reputation.ts';

export interface ReputationFields {
  ratingAverage: number;
  totalRatings: number;
  ratingScore: number;
  penaltyPoints: number;
  activeJobCount: number;
  completedJobs: number;
}

export interface JobIn {
  id: string;
  status: unknown;
  postedBy: unknown;
  assignedTo: unknown;
}

export interface CounterMarkerPlan {
  activeWorker: string | null;
  completedWorker: string | null;
}

const FIELDS: Array<keyof ReputationFields> = [
  'ratingAverage', 'totalRatings', 'ratingScore', 'penaltyPoints', 'activeJobCount', 'completedJobs',
];

/** assignedTo[0] as a doc id segment that is not the poster, else null (same rule as lib/counters.ts). */
function validWorker(job: JobIn): string | null {
  const w = Array.isArray(job.assignedTo) ? job.assignedTo[0] : undefined;
  return typeof w === 'string' && w !== '' && !w.includes('/') && w !== job.postedBy ? w : null;
}

/** The jobCounters marker a job should have today, or null (open, cancelled, no valid worker). */
export function markerFor(job: JobIn): CounterMarkerPlan | null {
  const worker = validWorker(job);
  if (!worker) return null;
  if (job.status === 'in-progress') return { activeWorker: worker, completedWorker: null };
  if (job.status === 'completed') return { activeWorker: null, completedWorker: worker };
  return null;
}

export function planReputation(
  users: Array<{ id: string; data: Record<string, unknown> }>,
  ratings: RatingDoc[],
  jobs: JobIn[],
  existingMarkers: Array<{ id: string; data: Record<string, unknown> }> = [],
): {
  userUpdates: Array<{
    uid: string;
    set: ReputationFields;
    /** Stored values that are numbers. */
    before: Partial<ReputationFields>;
    /** Stored values that are not numbers (untrusted: print with JSON.stringify). */
    invalidBefore: Record<string, unknown>;
  }>;
  markers: Array<{ jobId: string } & CounterMarkerPlan>;
  /** Ratings addressed to an existing profile that were not counted (random id, bad type or score, self...). */
  excludedRatings: number;
} {
  const stored = new Map(existingMarkers.map((m) => [m.id, m.data]));
  const markers: Array<{ jobId: string } & CounterMarkerPlan> = [];
  const active = new Map<string, number>();
  const completed = new Map<string, number>();
  for (const job of jobs) {
    const m = markerFor(job);
    if (!m) continue;
    // counts come from the jobs; a marker is only (re)written when the stored one differs
    if (m.activeWorker) active.set(m.activeWorker, (active.get(m.activeWorker) ?? 0) + 1);
    if (m.completedWorker) completed.set(m.completedWorker, (completed.get(m.completedWorker) ?? 0) + 1);
    const cur = stored.get(job.id);
    if (cur && cur.activeWorker === m.activeWorker && cur.completedWorker === m.completedWorker) continue;
    markers.push({ jobId: job.id, ...m });
  }

  let excludedRatings = 0;
  const userUpdates: ReturnType<typeof planReputation>['userUpdates'] = [];
  for (const { id, data } of users) {
    const { ratingAverage, totalRatings, excluded } = aggregateRatings(id, ratings);
    excludedRatings += excluded;
    const penaltyPoints = currentCount(data.penaltyPoints);
    const set: ReputationFields = {
      ratingAverage,
      totalRatings,
      ratingScore: reputationScore(ratingAverage, penaltyPoints),
      penaltyPoints,
      activeJobCount: active.get(id) ?? 0,
      completedJobs: completed.get(id) ?? 0,
    };
    if (FIELDS.every((f) => data[f] === set[f])) continue;
    const before: Partial<ReputationFields> = {};
    const invalidBefore: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (data[f] === undefined) continue;
      if (typeof data[f] === 'number') before[f] = data[f];
      else invalidBefore[f] = data[f];
    }
    userUpdates.push({ uid: id, set, before, invalidBefore });
  }
  return { userUpdates, markers, excludedRatings };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
