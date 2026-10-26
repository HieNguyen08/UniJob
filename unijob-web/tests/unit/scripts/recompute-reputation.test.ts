import { describe, expect, it } from 'vitest';
import { planCounters } from '../../../functions/src/lib/counters.ts';
import { chunk, markerFor, planReputation } from '../../../scripts/recompute-reputation-plan.ts';

const users = [
  { id: 'w1', data: { ratingScore: 5, totalRatings: 9, activeJobCount: 7, completedJobs: 40 } }, // forged under the old rules
  { id: 'p1', data: { ratingScore: 4.2, penaltyPoints: 5 } },
];
const rating = (jobId: string, from: string, to: string, score: number, extra: Record<string, unknown> = {}) => ({
  id: `${jobId}_${from}_${to}`,
  data: { jobId, fromUserId: from, toUserId: to, type: 'poster-to-worker', score, ...extra },
});
const ratings = [
  rating('j1', 'p1', 'w1', 4), rating('j2', 'p2', 'w1', 5),
  rating('j3', 'w1', 'w1', 5), rating('j4', 'p1', 'ghost', 1),
  { id: 'random-legacy-id', data: { jobId: 'j1', fromUserId: 'p3', toUserId: 'w1', type: 'poster-to-worker', score: 1 } },
  rating('j5', 'p4', 'w1', 1, { type: 'junk' }),
];
const jobs = [
  { id: 'j1', status: 'in-progress', postedBy: 'p1', assignedTo: ['w1'] },
  { id: 'j2', status: 'completed', postedBy: 'p1', assignedTo: ['w1'] },
  { id: 'j3', status: 'completed', postedBy: 'p1', assignedTo: ['p1'] },
  { id: 'j4', status: 'open', postedBy: 'p1', assignedTo: [] },
  { id: 'j5', status: 'in-progress', postedBy: 'p1', assignedTo: ['a/b'] },
];

describe('planReputation', () => {
  it('recomputes forged profile values from ratings and jobs', () => {
    const plan = planReputation(users, ratings, jobs);
    expect(plan.userUpdates.find((u) => u.uid === 'w1')?.set).toEqual({ ratingAverage: 4.5, totalRatings: 2, ratingScore: 4.5, penaltyPoints: 0, activeJobCount: 1, completedJobs: 1 });
    expect(plan.userUpdates.find((u) => u.uid === 'p1')?.set).toEqual({ ratingAverage: 0, totalRatings: 0, ratingScore: 0, penaltyPoints: 5, activeJobCount: 0, completedJobs: 0 });
    expect(plan.userUpdates.map((u) => u.uid)).not.toContain('ghost'); // no profile is created
    expect(plan.userUpdates.find((u) => u.uid === 'w1')?.before).toMatchObject({ ratingScore: 5, totalRatings: 9, activeJobCount: 7, completedJobs: 40 });
  });
  it('counts the ratings it excluded (invalid ones addressed to a profile; ratings for ghosts are ignored)', () => {
    expect(planReputation(users, ratings, jobs).excludedRatings).toBe(3); // w1: self-rating, random id, junk type
  });
  it('treats non-number stored values as invalid: kept out of before, listed in invalidBefore', () => {
    const plan = planReputation([{ id: 'w1', data: { ratingScore: '5', totalRatings: { x: 1 }, penaltyPoints: 'lots' } }], [], []);
    const u = plan.userUpdates[0];
    expect(u.before).toEqual({});
    expect(u.invalidBefore).toEqual({ ratingScore: '5', totalRatings: { x: 1 }, penaltyPoints: 'lots' });
    expect(u.set.penaltyPoints).toBe(0);
  });
  it('writes a counters marker for every in-progress or completed job with a valid worker', () => {
    expect(planReputation(users, ratings, jobs).markers).toEqual([
      { jobId: 'j1', activeWorker: 'w1', completedWorker: null },
      { jobId: 'j2', activeWorker: null, completedWorker: 'w1' },
    ]);
  });
  it('is idempotent: applying the plan and planning again lists no user', () => {
    const first = planReputation(users, ratings, jobs);
    const applied = users.map((u) => ({ id: u.id, data: { ...u.data, ...first.userUpdates.find((x) => x.uid === u.id)?.set } }));
    const again = planReputation(applied, ratings, jobs, first.markers.map(({ jobId, ...m }) => ({ id: jobId, data: m })));
    expect(again.userUpdates).toEqual([]);
    expect(again.markers).toEqual([]); // markers already equal to markerFor are skipped
  });
  it('rewrites a marker that differs from markerFor and one that is missing', () => {
    const existing = [{ id: 'j1', data: { activeWorker: 'someone-else', completedWorker: null } }, { id: 'j2', data: { activeWorker: null, completedWorker: 'w1' } }];
    expect(planReputation(users, ratings, jobs, existing).markers).toEqual([{ jobId: 'j1', activeWorker: 'w1', completedWorker: null }]);
  });
  it.each(jobs)('markerFor($id) agrees with the trigger rule (planCounters without a marker)', (job) => {
    expect(markerFor(job)).toEqual(planCounters(job.id, job, undefined)?.next ?? null);
  });
  it('chunk splits writes into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 400)).toEqual([]);
  });
});
