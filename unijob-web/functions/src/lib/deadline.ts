import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

// Deadline semantics shared by the expiry scheduler and cancelJob's penalty tiers.

/** Vietnam has no daylight saving time: always UTC+07:00. */
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
/** Legacy jobs created without a deadline stored `deadline: Timestamp.now()`, i.e. at creation time. */
const LEGACY_NO_DEADLINE_MS = 2 * 60_000;

/** 23:59:59.999 +07:00 of the Vietnam calendar day `ts` falls on, in epoch millis. */
export function vnDayEndMillis(ts: Timestamp): number {
  const vnDay = Math.floor((ts.toMillis() + VN_OFFSET_MS) / DAY_MS);
  return (vnDay + 1) * DAY_MS - VN_OFFSET_MS - 1;
}

/** 00:00 +07:00 of the Vietnam calendar day `ts` falls on, in epoch millis. */
export function vnDayStartMillis(ts: Timestamp): number {
  return vnDayEndMillis(ts) + 1 - DAY_MS;
}

/** True when `ms` is exactly 23:59:59.999 +07:00, the instant the web client stores for a chosen deadline day. */
export function isVnEndOfDay(ms: number): boolean {
  return (((ms + VN_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS === DAY_MS - 1;
}

/** True when `ms` is exactly 00:00 UTC: the client's `new Date('YYYY-MM-DD')` for a chosen day. */
export function isUtcMidnight(ms: number): boolean {
  return ms % DAY_MS === 0;
}

/**
 * A job created without a deadline: the old client stored `deadline: Timestamp.now()` (within
 * 2 minutes of createdAt). Deadlines the user picked as a date are never legacy, whatever their
 * distance to createdAt: the old client stores `new Date('YYYY-MM-DD')` (exactly 00:00 UTC, so a
 * job posted after 07:00 in Vietnam with deadline "today" is already past it), the new client
 * stores exactly 23:59:59.999 +07:00 (so posting at 23:58 cannot make a job never expire).
 */
export function isLegacyNoDeadline(job: DocumentData): boolean {
  const { deadline, createdAt } = job;
  return (
    deadline instanceof Timestamp &&
    createdAt instanceof Timestamp &&
    !isUtcMidnight(deadline.toMillis()) &&
    !isVnEndOfDay(deadline.toMillis()) &&
    deadline.toMillis() <= createdAt.toMillis() + LEGACY_NO_DEADLINE_MS
  );
}
