import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  CREATE_JOB_FALLBACK_ERROR,
  NO_DEADLINE_LABEL,
  PAST_DEADLINE_ERROR,
  createJobErrorMessage,
  deadlineFromDateInput,
  endOfDayVN,
  formatDeadline,
  isPastDateInput,
  todayVN,
} from '@/lib/deadline';

describe('endOfDayVN', () => {
  it.each([
    ['2026-10-17', '2026-10-17T16:59:59.999Z'],
    ['2026-01-31', '2026-01-31T16:59:59.999Z'], // month boundary
    ['2026-12-31', '2026-12-31T16:59:59.999Z'], // year boundary
    ['2028-02-29', '2028-02-29T16:59:59.999Z'], // leap day
    ['2026-03-01', '2026-03-01T16:59:59.999Z'],
  ])('%s ends at 23:59:59.999 in Vietnam (UTC+7) = %s', (input, iso) => {
    expect(endOfDayVN(input).toISOString()).toBe(iso);
  });

  it('is the last millisecond of that Vietnamese day', () => {
    const end = endOfDayVN('2026-12-31').getTime();
    // one millisecond later is 2027-01-01 00:00 in Vietnam
    expect(new Date(end + 1).toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it.each(['', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '17/10/2026', '2026-1-5', '2026-10-17T00:00', 'abc'])(
    'rejects %j',
    (input) => {
      expect(() => endOfDayVN(input)).toThrow(RangeError);
    },
  );
});

describe('deadlineFromDateInput', () => {
  it('stores no deadline as null', () => {
    expect(deadlineFromDateInput('')).toBeNull();
    expect(deadlineFromDateInput('   ')).toBeNull();
  });
  it('stores a date as a Timestamp at the end of that day in Vietnam', () => {
    const ts = deadlineFromDateInput('2026-10-17');
    expect(ts).toBeInstanceOf(Timestamp);
    expect(ts?.toDate().toISOString()).toBe('2026-10-17T16:59:59.999Z');
  });
});

describe('formatDeadline', () => {
  it('shows "Không có hạn" for a missing deadline', () => {
    expect(NO_DEADLINE_LABEL).toBe('Không có hạn');
    expect(formatDeadline(null)).toBe(NO_DEADLINE_LABEL);
    expect(formatDeadline(undefined)).toBe(NO_DEADLINE_LABEL);
    expect(formatDeadline('2026-10-17' as never)).toBe(NO_DEADLINE_LABEL); // legacy string, no toDate
  });
  it('formats a deadline as dd/MM/yyyy', () => {
    const d = new Date(2026, 9, 17, 12, 0, 0);
    expect(formatDeadline({ toDate: () => d })).toBe('17/10/2026');
  });
});

describe('todayVN', () => {
  it.each([
    ['2026-10-17T05:00:00.000Z', '2026-10-17'], // 12:00 in Vietnam
    ['2026-10-17T16:59:59.999Z', '2026-10-17'], // 23:59:59.999 in Vietnam
    ['2026-10-17T17:00:00.000Z', '2026-10-18'], // midnight in Vietnam, still the 17th in UTC
    ['2026-12-31T17:00:00.000Z', '2027-01-01'], // year boundary
    ['2028-02-28T18:00:00.000Z', '2028-02-29'], // leap day
    ['2026-01-31T16:30:00.000Z', '2026-01-31'], // month boundary (23:30 VN)
    ['2026-01-31T17:30:00.000Z', '2026-02-01'],
  ])('at %s it is %s in Vietnam', (iso, day) => {
    expect(todayVN(new Date(iso))).toBe(day);
  });
  it('defaults to the current time and is a valid end-of-day input', () => {
    expect(todayVN()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endOfDayVN(todayVN()).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('isPastDateInput', () => {
  const now = new Date('2026-10-17T17:30:00.000Z'); // 2026-10-18 00:30 in Vietnam
  it('is true only for a date before today in Vietnam', () => {
    expect(isPastDateInput('2026-10-17', now)).toBe(true);
    expect(isPastDateInput('2025-12-31', now)).toBe(true);
    expect(isPastDateInput('2026-10-18', now)).toBe(false);
    expect(isPastDateInput('2027-01-01', now)).toBe(false);
  });
  it('is false for an empty value (no deadline)', () => {
    expect(isPastDateInput('', now)).toBe(false);
    expect(isPastDateInput('  ', now)).toBe(false);
  });
});

describe('createJobErrorMessage', () => {
  const now = new Date('2026-10-17T05:00:00.000Z');
  const denied = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  it('explains a past deadline when the create was denied', () => {
    expect(PAST_DEADLINE_ERROR).toBe('Hạn chót phải từ hôm nay trở đi');
    expect(createJobErrorMessage(denied, '2026-10-16', now)).toBe(PAST_DEADLINE_ERROR);
  });
  it('is generic for a denial with a valid or empty deadline, and for other errors', () => {
    expect(createJobErrorMessage(denied, '2026-10-17', now)).toBe(CREATE_JOB_FALLBACK_ERROR);
    expect(createJobErrorMessage(denied, '', now)).toBe(CREATE_JOB_FALLBACK_ERROR);
    expect(createJobErrorMessage({ code: 'unavailable' }, '2026-10-16', now)).toBe(CREATE_JOB_FALLBACK_ERROR);
    expect(createJobErrorMessage(new Error('x'), '2026-10-16', now)).toBe(CREATE_JOB_FALLBACK_ERROR);
    expect(createJobErrorMessage(undefined, '2026-10-16', now)).toBe(CREATE_JOB_FALLBACK_ERROR);
    expect(CREATE_JOB_FALLBACK_ERROR).toBe('Lỗi khi đăng việc');
  });
});
