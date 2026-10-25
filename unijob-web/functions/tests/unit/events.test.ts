import { describe, expect, it } from 'vitest';
import { eventTooOld, MAX_EVENT_AGE_MS } from '../../src/lib/events.js';

describe('eventTooOld', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  it('is false for a fresh event, a missing time or an unparseable time', () => {
    expect(eventTooOld('2026-10-26T11:59:00Z', now)).toBe(false);
    expect(eventTooOld(undefined, now)).toBe(false);
    expect(eventTooOld('not a date', now)).toBe(false);
  });
  it('is true after 24 hours', () => {
    expect(MAX_EVENT_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(eventTooOld('2026-10-25T11:59:59Z', now)).toBe(true);
    expect(eventTooOld('2026-10-25T12:00:01Z', now)).toBe(false);
  });
});
