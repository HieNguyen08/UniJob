import { Timestamp } from 'firebase/firestore';

/** Shown wherever a job deadline would be rendered but the job has none. */
export const NO_DEADLINE_LABEL = 'Không có hạn';
export const PAST_DEADLINE_ERROR = 'Hạn chót phải từ hôm nay trở đi';
export const CREATE_JOB_FALLBACK_ERROR = 'Lỗi khi đăng việc';

/** Vietnam is UTC+7 all year (no daylight saving). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * End of the given calendar day in Vietnam (23:59:59.999 +07:00) for an `<input type="date">`
 * value `YYYY-MM-DD`. The server scheduler cancels open jobs once the deadline has passed, so a
 * date-only deadline must last the whole Vietnamese day. Throws RangeError for anything else.
 */
export function endOfDayVN(dateString: string): Date {
  const m = DATE_INPUT.exec(dateString);
  if (!m) throw new RangeError(`Ngày không hợp lệ: ${JSON.stringify(dateString)}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Ngày không hợp lệ: ${JSON.stringify(dateString)}`);
  }
  // next Vietnamese midnight (= utcMidnight + 1 day - 7h), minus 1 ms
  return new Date(utcMidnight + 24 * 60 * 60 * 1000 - VN_OFFSET_MS - 1);
}

/** Value stored in jobs.deadline: null when the poster left the date empty. */
export function deadlineFromDateInput(value: string): Timestamp | null {
  const trimmed = value.trim();
  return trimmed ? Timestamp.fromDate(endOfDayVN(trimmed)) : null;
}

/** dd/MM/yyyy for a deadline, or NO_DEADLINE_LABEL for a missing/legacy (non-Timestamp) value. */
export function formatDeadline(deadline: { toDate: () => Date } | null | undefined): string {
  if (!deadline || typeof deadline.toDate !== 'function') return NO_DEADLINE_LABEL;
  const d = deadline.toDate();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Today's date in Vietnam as `YYYY-MM-DD` (the `min` of the deadline date input). */
export function todayVN(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whether a date input value is a day before today in Vietnam. Empty (no deadline) is never past. */
export function isPastDateInput(value: string, now: Date = new Date()): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed < todayVN(now); // YYYY-MM-DD compares lexically
}

/**
 * Toast text when creating a job fails. The rules deny a deadline that is not in the future, so a
 * permission-denied with a past date means the deadline; anything else gets the generic text.
 */
export function createJobErrorMessage(err: unknown, deadlineInput: string, now: Date = new Date()): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  if (code === 'permission-denied' && isPastDateInput(deadlineInput, now)) return PAST_DEADLINE_ERROR;
  return CREATE_JOB_FALLBACK_ERROR;
}
