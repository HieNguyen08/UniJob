import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { isLegacyNoDeadline, isOverdue, isVnEndOfDay, vnDayEndMillis, vnDayStartMillis } from '../../../src/handlers/expireJobs.js';

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('vnDayEndMillis', () => {
  it('is 23:59:59.999 +07:00 of the Vietnam calendar day the instant falls on', () => {
    expect(vnDayEndMillis(at('2026-10-17T03:00:00Z'))).toBe(Date.parse('2026-10-17T16:59:59.999Z'));
    // 23:30 on Oct 16 UTC is already 06:30 on Oct 17 in Vietnam
    expect(vnDayEndMillis(at('2026-10-16T23:30:00Z'))).toBe(Date.parse('2026-10-17T16:59:59.999Z'));
    // 00:00 Oct 17 in Vietnam is still Oct 16 in UTC
    expect(vnDayEndMillis(at('2026-10-16T17:00:00Z'))).toBe(Date.parse('2026-10-17T16:59:59.999Z'));
    expect(vnDayEndMillis(at('2026-10-16T16:59:59.999Z'))).toBe(Date.parse('2026-10-16T16:59:59.999Z'));
  });
});

describe('vnDayStartMillis', () => {
  it('is 00:00 +07:00 of the Vietnam calendar day the instant falls on', () => {
    expect(vnDayStartMillis(at('2026-10-17T03:00:00Z'))).toBe(Date.parse('2026-10-16T17:00:00Z'));
    expect(vnDayStartMillis(at('2026-10-16T17:00:00Z'))).toBe(Date.parse('2026-10-16T17:00:00Z'));
    expect(vnDayStartMillis(at('2026-10-16T16:59:59.999Z'))).toBe(Date.parse('2026-10-15T17:00:00Z'));
  });
});

describe('isVnEndOfDay', () => {
  it('matches only 23:59:59.999 +07:00', () => {
    expect(isVnEndOfDay(Date.parse('2026-10-17T16:59:59.999Z'))).toBe(true);
    expect(isVnEndOfDay(Date.parse('2026-10-17T16:59:59.998Z'))).toBe(false);
    expect(isVnEndOfDay(Date.parse('2026-10-17T17:00:00Z'))).toBe(false);
    expect(isVnEndOfDay(Date.parse('2026-10-17T23:59:59.999Z'))).toBe(false); // UTC end of day
  });
});

describe('isLegacyNoDeadline', () => {
  const created = at('2026-10-01T05:00:00Z');
  it('is true when the deadline is within 2 minutes of createdAt', () => {
    expect(isLegacyNoDeadline({ deadline: created, createdAt: created })).toBe(true);
    expect(isLegacyNoDeadline({ deadline: at('2026-10-01T05:02:00Z'), createdAt: created })).toBe(true);
  });
  it('is true for a real legacy Timestamp.now() deadline (a few ms after createdAt)', () => {
    expect(isLegacyNoDeadline({ deadline: at('2026-10-01T05:00:00.137Z'), createdAt: created })).toBe(true);
  });
  it("is false for today's client value new Date('YYYY-MM-DD') (00:00 UTC), posted later that day", () => {
    const deadline = Timestamp.fromDate(new Date('2026-10-17')); // 07:00 Oct 17 in Vietnam
    const created = at('2026-10-17T05:30:00Z'); // 12:30 Oct 17 in Vietnam, after the deadline instant
    expect(isLegacyNoDeadline({ deadline, createdAt: created })).toBe(false);
    expect(isOverdue({ deadline, createdAt: created }, at('2026-10-17T16:59:59.999Z'))).toBe(false);
    expect(isOverdue({ deadline, createdAt: created }, at('2026-10-17T17:00:00Z'))).toBe(true);
    // a past date picked at creation is not legacy either: it expires on the next run
    expect(isLegacyNoDeadline({ deadline: Timestamp.fromDate(new Date('2026-10-10')), createdAt: created })).toBe(false);
  });
  it('is false for an exact Vietnam end-of-day deadline, even when posted just before midnight', () => {
    // posted 23:58 on Oct 17 in Vietnam with deadline 'today' = 23:59:59.999 +07:00
    const endOfDay = at('2026-10-17T16:59:59.999Z');
    expect(isLegacyNoDeadline({ deadline: endOfDay, createdAt: at('2026-10-17T16:58:00Z') })).toBe(false);
    expect(isLegacyNoDeadline({ deadline: endOfDay, createdAt: endOfDay })).toBe(false);
    expect(isOverdue({ deadline: endOfDay, createdAt: at('2026-10-17T16:58:00Z') }, at('2026-10-17T17:00:00Z'))).toBe(true);
  });
  it('is false for a real deadline, or without Timestamp deadline and createdAt', () => {
    expect(isLegacyNoDeadline({ deadline: at('2026-10-01T05:02:00.001Z'), createdAt: created })).toBe(false);
    expect(isLegacyNoDeadline({ deadline: created })).toBe(false);
    expect(isLegacyNoDeadline({ deadline: '2026-10-01', createdAt: created })).toBe(false);
  });
});

describe('isOverdue', () => {
  const deadline = at('2026-10-17T02:00:00Z'); // 09:00 Oct 17 in Vietnam
  const created = at('2026-10-10T00:00:00Z');

  it('is false for the rest of the deadline day in Vietnam, even after the deadline instant', () => {
    expect(isOverdue({ deadline, createdAt: created }, at('2026-10-17T03:00:00Z'))).toBe(false);
    expect(isOverdue({ deadline, createdAt: created }, at('2026-10-17T16:59:59.999Z'))).toBe(false);
  });
  it('is true once the deadline day has ended in Vietnam', () => {
    expect(isOverdue({ deadline, createdAt: created }, at('2026-10-17T17:00:00Z'))).toBe(true);
  });
  it('skips legacy "no deadline" jobs whose deadline is within 2 minutes of createdAt', () => {
    const legacyCreated = at('2026-10-01T05:00:00Z');
    const later = at('2026-10-20T00:00:00Z');
    expect(isOverdue({ deadline: legacyCreated, createdAt: legacyCreated }, later)).toBe(false);
    expect(isOverdue({ deadline: at('2026-10-01T05:02:00Z'), createdAt: legacyCreated }, later)).toBe(false);
    expect(isOverdue({ deadline: at('2026-10-01T05:02:00.001Z'), createdAt: legacyCreated }, later)).toBe(true);
  });
  it('applies the day rule when createdAt is missing or not a Timestamp', () => {
    expect(isOverdue({ deadline }, at('2026-10-18T00:00:00Z'))).toBe(true);
    expect(isOverdue({ deadline, createdAt: '2026-10-17' }, at('2026-10-18T00:00:00Z'))).toBe(true);
  });
  it('is false for a missing or non-Timestamp deadline', () => {
    const later = at('2030-01-01T00:00:00Z');
    expect(isOverdue({}, later)).toBe(false);
    expect(isOverdue({ deadline: '2020-01-01' }, later)).toBe(false);
    expect(isOverdue({ deadline: null }, later)).toBe(false);
    expect(isOverdue({ deadline: 1_600_000_000_000 }, later)).toBe(false);
  });
});
