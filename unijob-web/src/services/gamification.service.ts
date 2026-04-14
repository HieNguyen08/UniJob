/**
 * Gamification Service
 * --------------------
 * All calculations are client-side, derived from existing Firestore data
 * (jobs, ratings, user profile). No new collections needed.
 */

import type { Job, Rating } from '@/types';
import type { User } from '@/types/user';
import {
  BADGES,
  LEVELS,
  XP_REWARDS,
  type BadgeDefinition,
  type LevelDefinition,
} from '@/lib/constants';

// ─── Public Types ────────────────────────────────────────────
export interface EarnedBadge extends BadgeDefinition {
  earnedAt: string; // human-readable reason
}

export interface GamificationProfile {
  xp: number;
  level: LevelDefinition;
  xpProgress: number;        // 0-100 % toward next level
  badges: EarnedBadge[];
  nextBadgeHint: string | null;
}

// ─── Internal helpers ────────────────────────────────────────

function badgeDef(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

function earned(id: string, reason: string): EarnedBadge | null {
  const def = badgeDef(id);
  if (!def) return null;
  return { ...def, earnedAt: reason };
}

function getLevel(xp: number): LevelDefinition {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) return LEVELS[i];
  }
  return LEVELS[0];
}

function getLevelProgress(xp: number, level: LevelDefinition): number {
  if (level.level === LEVELS.length) {
    // Max level — always full
    return 100;
  }
  const range = level.maxXP - level.minXP + 1;
  const progress = xp - level.minXP;
  return Math.min(100, Math.round((progress / range) * 100));
}

// ─── Main computation ────────────────────────────────────────

export function computeGamification(
  user: User | null,
  jobs: Job[],
  ratings: Rating[],
): GamificationProfile {
  if (!user) {
    return {
      xp: 0,
      level: LEVELS[0],
      xpProgress: 0,
      badges: [],
      nextBadgeHint: 'Đăng nhập để bắt đầu hành trình!',
    };
  }

  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const postedJobs = jobs.filter((j) => j.postedBy === user.uid);
  const urgentCompleted = completedJobs.filter((j) => j.isUrgent);
  const fiveStarRatings = ratings.filter((r) => r.score === 5);

  // ── Calculate XP ──
  let xp = 0;
  xp += completedJobs.length * XP_REWARDS.COMPLETE_JOB;
  xp += postedJobs.length * XP_REWARDS.POST_JOB;
  xp += ratings.length * XP_REWARDS.RECEIVE_RATING;
  xp += fiveStarRatings.length * XP_REWARDS.FIVE_STAR_BONUS;

  // Profile completeness bonus
  const profileComplete =
    !!user.displayName &&
    !!user.faculty &&
    !!user.studentId &&
    !!user.phone &&
    !!user.bio &&
    (user.skills?.length ?? 0) > 0;
  if (profileComplete) xp += XP_REWARDS.COMPLETE_PROFILE;

  const level = getLevel(xp);
  const xpProgress = getLevelProgress(xp, level);

  // ── Determine earned badges ──
  const badges: EarnedBadge[] = [];

  // Jobs milestones
  if (completedJobs.length >= 1) {
    const b = earned('first_job', `Hoàn thành ${completedJobs.length} việc`);
    if (b) badges.push(b);
  }
  if (completedJobs.length >= 5) {
    const b = earned('five_jobs', `Hoàn thành ${completedJobs.length} việc`);
    if (b) badges.push(b);
  }
  if (completedJobs.length >= 10) {
    const b = earned('ten_jobs', `Hoàn thành ${completedJobs.length} việc`);
    if (b) badges.push(b);
  }
  if (completedJobs.length >= 20) {
    const b = earned('twenty_jobs', `Hoàn thành ${completedJobs.length} việc`);
    if (b) badges.push(b);
  }

  // Rating achievements
  if (fiveStarRatings.length >= 1) {
    const b = earned('first_star', `${fiveStarRatings.length} đánh giá 5 sao`);
    if (b) badges.push(b);
  }
  if (user.ratingScore >= 4.5 && ratings.length >= 3) {
    const b = earned('high_rating', `Điểm TB ${user.ratingScore.toFixed(1)}`);
    if (b) badges.push(b);
  }
  if (ratings.length >= 10) {
    const b = earned('ten_reviews', `${ratings.length} đánh giá`);
    if (b) badges.push(b);
  }
  if (ratings.length >= 20) {
    const b = earned('twenty_reviews', `${ratings.length} đánh giá`);
    if (b) badges.push(b);
  }

  // Social
  if (postedJobs.length >= 1) {
    const b = earned('first_post', `Đăng ${postedJobs.length} công việc`);
    if (b) badges.push(b);
  }
  if (postedJobs.length >= 5) {
    const b = earned('five_posts', `Đăng ${postedJobs.length} công việc`);
    if (b) badges.push(b);
  }
  if (urgentCompleted.length >= 3) {
    const b = earned('urgent_hero', `${urgentCompleted.length} việc khẩn cấp`);
    if (b) badges.push(b);
  }

  // Profile
  if (profileComplete) {
    const b = earned('full_profile', 'Hồ sơ đầy đủ');
    if (b) badges.push(b);
  }
  if ((user.skills?.length ?? 0) >= 5) {
    const b = earned('skill_master', `${user.skills.length} kỹ năng`);
    if (b) badges.push(b);
  }

  // ── Next badge hint ──
  let nextBadgeHint: string | null = null;
  if (completedJobs.length < 1) {
    nextBadgeHint = 'Hoàn thành công việc đầu tiên để nhận huy hiệu "Khởi Đầu"!';
  } else if (completedJobs.length < 5) {
    nextBadgeHint = `Còn ${5 - completedJobs.length} việc nữa để đạt "Chuyên Cần"`;
  } else if (completedJobs.length < 10) {
    nextBadgeHint = `Còn ${10 - completedJobs.length} việc nữa để đạt "Bậc Thầy"`;
  } else if (ratings.length < 10) {
    nextBadgeHint = `Còn ${10 - ratings.length} đánh giá nữa để đạt "Uy Tín Vàng"`;
  } else if (!profileComplete) {
    nextBadgeHint = 'Hoàn thiện hồ sơ 100% để nhận "Hồ Sơ Vàng"!';
  }

  return { xp, level, xpProgress, badges, nextBadgeHint };
}
