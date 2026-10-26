import { describe, expect, it } from 'vitest';
import {
  aggregateRatings, currentAverage, currentCount, planPenalty, POSTER_PENALTY, reputationScore, round1, workerPenalty,
} from '../../src/lib/reputation.js';

let n = 0;
/** A rating doc whose id follows the rules' `${jobId}_${from}_${to}` format (unique per call unless `jobId` is given). */
const r = (score: unknown, extra: Record<string, unknown> = {}) => {
  const data = { jobId: `j${n++}`, toUserId: 'u1', fromUserId: 'x', type: 'poster-to-worker', score, ...extra };
  return { id: `${data.jobId}_${data.fromUserId}_${data.toUserId}`, data };
};
const NOW = 1_800_000_000_000;
const inHours = (h: number) => NOW + h * 3_600_000;

describe('reputation', () => {
  it('round1 and reputationScore', () => {
    expect(round1(4.25)).toBe(4.3);
    expect(reputationScore(4.3, 5)).toBe(3.8);
    expect(reputationScore(1, 20)).toBe(0); // never negative
    expect(reputationScore(0, 0)).toBe(0);
  });
  it('aggregateRatings counts only valid ratings for that user', () => {
    expect(aggregateRatings('u1', [r(5), r(4), r(4)])).toEqual({ ratingAverage: 4.3, totalRatings: 3, excluded: 0 });
    expect(aggregateRatings('u1', [r(5), r(0), r(6), r(4.5), r('5'), r(3, { toUserId: 'u2' }), r(1, { fromUserId: 'u1' })]))
      .toEqual({ ratingAverage: 5, totalRatings: 1, excluded: 5 });
    expect(aggregateRatings('u1', [])).toEqual({ ratingAverage: 0, totalRatings: 0, excluded: 0 });
  });
  it('aggregateRatings drops random-id docs, unknown types and duplicate keys', () => {
    const good = r(5);
    const randomId = { ...r(1), id: 'abc123' };
    const wrongKey = { ...r(1), id: 'other_x_u1' };
    const badType = r(1, { type: 'self' });
    const noType = r(1, { type: undefined });
    const dup = { ...good };
    expect(aggregateRatings('u1', [good, randomId, wrongKey, badType, noType, dup]))
      .toEqual({ ratingAverage: 5, totalRatings: 1, excluded: 5 });
    expect(aggregateRatings('u1', [r(3, { type: 'worker-to-poster' })]).totalRatings).toBe(1);
  });
  it('currentAverage falls back to a legacy ratingScore in [0, 5]', () => {
    expect(currentAverage({ ratingAverage: 4.5, ratingScore: 3 })).toBe(4.5);
    expect(currentAverage({ ratingScore: 4.2 })).toBe(4.2);
    expect(currentAverage({ ratingScore: 9 })).toBe(0);
    expect(currentAverage(undefined)).toBe(0);
  });
  it('currentCount treats junk as 0', () => {
    expect(currentCount(3)).toBe(3);
    for (const v of [-1, 1.5, '2', null, undefined]) expect(currentCount(v)).toBe(0);
  });
  it('planPenalty adds points and recomputes the score', () => {
    expect(planPenalty({ ratingAverage: 4.5, penaltyPoints: 5 }, 5)).toEqual({ penaltyPoints: 10, ratingScore: 3.5 });
    expect(planPenalty({ ratingScore: 4.2 }, POSTER_PENALTY)).toEqual({ penaltyPoints: 5, ratingScore: 3.7 });
  });
  it.each([
    ['6h left', inHours(6), 20], ['passed', inHours(-2), 20], ['12h left', inHours(12), 10],
    ['23h left', inHours(23), 10], ['24h left', inHours(24), 5], ['no deadline', null, 5],
  ])('workerPenalty %s -> %d', (_l, deadlineMs, points) => expect(workerPenalty(deadlineMs, NOW)).toBe(points));
});
