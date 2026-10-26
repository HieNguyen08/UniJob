// Pure reputation rules (plan 2026-10-25-server-reputation, Decision 1).
// This file must have NO imports: the backfill script loads it under plain Node.

export const POSTER_PENALTY = 5;

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Displayed score: the rating average minus 0.1 per penalty point, never below 0. */
export function reputationScore(ratingAverage: number, penaltyPoints: number): number {
  return round1(Math.max(0, ratingAverage - 0.1 * penaltyPoints));
}

/** A non-negative integer, else 0. */
export function currentCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The stored average; a legacy profile falls back to ratingScore when it is a number in [0, 5], else 0. */
export function currentAverage(user: Record<string, unknown> | undefined): number {
  if (!user) return 0;
  const avg = user.ratingAverage;
  if (typeof avg === 'number' && Number.isFinite(avg)) return avg;
  const score = user.ratingScore;
  return typeof score === 'number' && score >= 0 && score <= 5 ? score : 0;
}

export interface RatingDoc {
  id: string;
  data: Record<string, unknown>;
}

const RATING_TYPES = ['poster-to-worker', 'worker-to-poster'];

/**
 * A rating counts when its doc id is exactly `${jobId}_${fromUserId}_${toUserId}` (the rules' create check, so
 * random-id legacy or forged docs are out), its type is one of the two directions, `score` is an integer from
 * 1 to 5 and from !== to. Counted once per key. `excluded` is the number of other ratings addressed to `uid`.
 */
export function aggregateRatings(
  uid: string,
  ratings: RatingDoc[],
): { ratingAverage: number; totalRatings: number; excluded: number } {
  const seen = new Set<string>();
  let sum = 0;
  let n = 0;
  let excluded = 0;
  for (const { id, data } of ratings) {
    if (data.toUserId !== uid) continue;
    const s = data.score;
    const valid =
      data.fromUserId !== uid &&
      typeof data.fromUserId === 'string' &&
      typeof data.jobId === 'string' &&
      id === `${data.jobId}_${data.fromUserId}_${uid}` &&
      typeof data.type === 'string' &&
      RATING_TYPES.includes(data.type) &&
      typeof s === 'number' &&
      Number.isInteger(s) &&
      s >= 1 &&
      s <= 5 &&
      !seen.has(id);
    if (!valid) {
      excluded += 1;
      continue;
    }
    seen.add(id);
    sum += s;
    n += 1;
  }
  return { ratingAverage: n === 0 ? 0 : round1(sum / n), totalRatings: n, excluded };
}

export function planPenalty(
  user: Record<string, unknown> | undefined,
  points: number,
): { penaltyPoints: number; ratingScore: number } {
  const penaltyPoints = currentCount(user?.penaltyPoints) + points;
  return { penaltyPoints, ratingScore: reputationScore(currentAverage(user), penaltyPoints) };
}

/** Penalty for a worker cancelling, by hours to the deadline (a passed deadline counts as under 12 h). */
export function workerPenalty(deadlineMs: number | null, now: number): 5 | 10 | 20 {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) return 5;
  const hours = (deadlineMs - now) / 3_600_000;
  if (hours < 12) return 20;
  if (hours < 24) return 10;
  return 5;
}
