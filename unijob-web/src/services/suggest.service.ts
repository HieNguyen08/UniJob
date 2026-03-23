import type { Job } from '@/types/job';
import type { User } from '@/types/user';
import type { Application } from '@/types/job';

export interface ScoredJob extends Job {
  matchScore: number;
  matchReasons: string[];
}

const WEIGHT_FACULTY = 40;
const WEIGHT_SKILLS = 30;
const WEIGHT_CATEGORY = 20;
const WEIGHT_RECENCY = 10;
const URGENT_BONUS = 5;
const MAX_SUGGESTIONS = 6;

/**
 * Get suggested jobs for a user based on profile matching.
 *
 * Scoring (out of ~105):
 * - Faculty match: 40 pts
 * - Skills/tags overlap: 30 pts
 * - Category affinity (from past applications): 20 pts
 * - Recency (newer = higher): 10 pts
 * - Urgent bonus: +5 pts
 */
export function getSuggestedJobs(
  user: User,
  allJobs: Job[],
  userApplications: Application[]
): ScoredJob[] {
  const appliedJobIds = new Set(userApplications.map((a) => a.jobId));

  // Determine category affinity from past applications
  const categoryCounts = new Map<string, number>();
  // We can't directly get job categories from applications alone,
  // so we match applicationJobIds against allJobs to build affinity
  const allJobsMap = new Map(allJobs.map((j) => [j.id, j]));
  for (const app of userApplications) {
    const job = allJobsMap.get(app.jobId);
    if (job) {
      categoryCounts.set(job.category, (categoryCounts.get(job.category) || 0) + 1);
    }
  }
  const affinityCategories = new Set(categoryCounts.keys());

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const scored: ScoredJob[] = [];

  for (const job of allJobs) {
    // Exclude: own jobs, already applied, non-open
    if (job.postedBy === user.uid) continue;
    if (appliedJobIds.has(job.id)) continue;
    if (job.status !== 'open') continue;

    let totalScore = 0;
    const reasons: string[] = [];

    // 1. Faculty match
    if (user.faculty && job.faculty && job.faculty === user.faculty) {
      totalScore += WEIGHT_FACULTY;
      reasons.push('Cùng khoa');
    }

    // 2. Skills/tags match
    if (user.skills?.length > 0 && job.tags?.length > 0) {
      const userSkillsLower = new Set(user.skills.map((s) => s.toLowerCase()));
      const matchingTags = job.tags.filter((t) => userSkillsLower.has(t.toLowerCase()));
      if (matchingTags.length > 0) {
        const ratio = matchingTags.length / job.tags.length;
        totalScore += Math.round(ratio * WEIGHT_SKILLS);
        reasons.push(`Kỹ năng phù hợp: ${matchingTags.join(', ')}`);
      }
    }

    // 3. Category affinity
    if (affinityCategories.has(job.category)) {
      totalScore += WEIGHT_CATEGORY;
      reasons.push('Danh mục bạn quan tâm');
    }

    // 4. Recency bonus
    if (job.createdAt) {
      const jobTime = job.createdAt.toDate().getTime();
      const age = now - jobTime;
      if (age < SEVEN_DAYS_MS) {
        const recencyScore = Math.round((1 - age / SEVEN_DAYS_MS) * WEIGHT_RECENCY);
        totalScore += recencyScore;
      }
    }

    // 5. Urgent bonus
    if (job.isUrgent) {
      totalScore += URGENT_BONUS;
      reasons.push('Việc khẩn cấp');
    }

    // Only include if there's some relevance
    if (totalScore > 0 || reasons.length > 0) {
      scored.push({
        ...job,
        matchScore: totalScore,
        matchReasons: reasons.length > 0 ? reasons : ['Công việc mới'],
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  // If we don't have enough scored results, fill with recent open jobs
  if (scored.length < MAX_SUGGESTIONS) {
    const scoredIds = new Set(scored.map((j) => j.id));
    for (const job of allJobs) {
      if (scored.length >= MAX_SUGGESTIONS) break;
      if (job.postedBy === user.uid) continue;
      if (appliedJobIds.has(job.id)) continue;
      if (job.status !== 'open') continue;
      if (scoredIds.has(job.id)) continue;
      scored.push({
        ...job,
        matchScore: 0,
        matchReasons: ['Công việc mới'],
      });
    }
  }

  return scored.slice(0, MAX_SUGGESTIONS);
}
