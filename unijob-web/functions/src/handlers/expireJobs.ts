import { FieldValue, Timestamp, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { toJobInfo } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

export interface ExpireOptions {
  pageSize?: number;
  maxPages?: number;
  /** Test seam: runs after each page's query, before its writes. */
  beforeWrite?: () => Promise<void>;
}

export interface ExpireResult {
  expired: number;
  notified: number;
  /** Jobs changed after the query (precondition failed) or that failed to update; retried next run. */
  skipped: number;
  /** Returned by the query but not overdue by isOverdue (defence in depth; normally 0). */
  notDue: number;
  /** Legacy "no deadline" jobs whose deadline was set to null so later scans skip them. */
  legacyCleared: number;
  /** The page limit was reached: more overdue jobs may be left for the next run. */
  more: boolean;
}

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

/**
 * A job is overdue only after its deadline's whole calendar day has ended in Vietnam (the web
 * client picks a date, so "deadline 17/10" means the job is open all of Oct 17). Never for a
 * missing or non-Timestamp deadline, or a legacy "no deadline" job.
 */
export function isOverdue(job: DocumentData, now: Timestamp): boolean {
  const { deadline } = job;
  if (!(deadline instanceof Timestamp) || isLegacyNoDeadline(job)) return false;
  return now.toMillis() > vnDayEndMillis(deadline);
}

/**
 * Open jobs whose deadline day ended (see isOverdue) -> status 'cancelled' with cancelReason
 * 'expired', then deadline_expired to the poster. The query is bounded by 00:00 today in Vietnam,
 * so jobs still due today never take up the page budget. Legacy "no deadline" jobs get
 * `deadline: null` (no status change, no notification), which drops them from later scans.
 * Replaces the client-side cleanup.service.ts. Each update carries a lastUpdateTime precondition so
 * a job its poster just edited is left alone, and only jobs actually cancelled are notified.
 * Needs the composite index jobs(status ASC, deadline ASC).
 */
export async function expireOverdueJobs(
  db: Firestore,
  now: Timestamp,
  { pageSize = 200, maxPages = 10, beforeWrite }: ExpireOptions = {},
): Promise<ExpireResult> {
  const result: ExpireResult = { expired: 0, notified: 0, skipped: 0, notDue: 0, legacyCleared: 0, more: false };
  const todayStart = Timestamp.fromMillis(vnDayStartMillis(now));
  let cursor: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < maxPages; page++) {
    let query = db.collection('jobs').where('status', '==', 'open').where('deadline', '<', todayStart).orderBy('deadline').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) return result;
    await beforeWrite?.();

    await Promise.all(
      snap.docs.map(async (doc) => {
        if (isLegacyNoDeadline(doc.data())) {
          try {
            await doc.ref.update({ deadline: null, updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: doc.updateTime });
            result.legacyCleared++;
          } catch (err) {
            result.skipped++;
            logger.info('expireOverdueJobs: legacy job changed or update failed, left for the next run', { jobId: doc.id, err: String(err) });
          }
          return;
        }
        if (!isOverdue(doc.data(), now)) {
          result.notDue++;
          return;
        }
        try {
          await doc.ref.update(
            { status: 'cancelled', cancelReason: 'expired', updatedAt: FieldValue.serverTimestamp() },
            { lastUpdateTime: doc.updateTime },
          );
        } catch (err) {
          result.skipped++;
          logger.info('expireOverdueJobs: job changed or update failed, left for the next run', { jobId: doc.id, err: String(err) });
          return;
        }
        result.expired++;
        const job = toJobInfo(doc.id, doc.data());
        if (!job?.postedBy) return;
        try {
          const written = await writeNotification(db, {
            userId: job.postedBy,
            type: 'deadline_expired',
            message: messages.deadlineExpired(job.title),
            extras: { jobId: job.id, jobTitle: job.title },
            sourceId: job.id,
          });
          if (written) result.notified++;
        } catch (err) {
          logger.error('deadline_expired: job cancelled but notification failed', { jobId: doc.id, err: String(err) });
        }
      }),
    );

    if (snap.size < pageSize) return result;
    cursor = snap.docs[snap.docs.length - 1];
  }
  result.more = true;
  logger.warn('expireOverdueJobs: page limit reached, the rest is handled by the next run', { maxPages, pageSize });
  return result;
}
