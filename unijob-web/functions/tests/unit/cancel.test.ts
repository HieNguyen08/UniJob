import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER } from '../../src/lib/auth.js';
import { CANCEL_MSG, cancelParties, parseCancelInput, planCancel } from '../../src/lib/cancel.js';
import { toJobInfo } from '../../src/lib/jobs.js';

const job = { title: 'Nhập liệu', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'], payment: 150_000, paymentType: 'fixed' };
const trusted = { jobId: 'j1', source: 'server', serverVersion: 'completion-v1', workerConfirmed: true };
const held = { jobId: 'j1', payerId: 'p1', payeeId: 'w1', status: 'held', source: 'server' };

describe('parseCancelInput', () => {
  it('accepts a known reason or none', () => {
    expect(parseCancelInput({ jobId: 'j1', reason: 'Khác' })).toEqual({ jobId: 'j1', reason: 'Khác' });
    expect(parseCancelInput({ jobId: 'j1' })).toEqual({ jobId: 'j1', reason: null });
    expect(parseCancelInput({ jobId: 'j1', reason: null })).toEqual({ jobId: 'j1', reason: null });
  });
  it.each([[{ jobId: 'a/b' }, CANCEL_MSG.invalid], [null, CANCEL_MSG.invalid], [{ jobId: 'j1', reason: 'lý do khác' }, CANCEL_MSG.invalidReason], [{ jobId: 'j1', reason: 3 }, CANCEL_MSG.invalidReason]])(
    'rejects %j', (data, message) => expect(() => parseCancelInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message })));
});

describe('cancelParties', () => {
  it.each([
    ['missing job', undefined, 'p1', 'Khác', 'not-found', MSG_JOB_NOT_FOUND],
    ['outsider on a cancelled job', { ...job, status: 'cancelled' }, 'mallory', 'Khác', 'permission-denied', MSG_NOT_MEMBER],
    ['second assignee', { ...job, assignedTo: ['w1', 'w2'] }, 'w2', 'Khác', 'permission-denied', MSG_NOT_MEMBER],
    ['already cancelled', { ...job, status: 'cancelled' }, 'p1', null, 'failed-precondition', CANCEL_MSG.alreadyCancelled],
    ['poster on completed', { ...job, status: 'completed' }, 'p1', null, 'failed-precondition', CANCEL_MSG.notCancellable],
    ['worker on completed', { ...job, status: 'completed' }, 'w1', 'Khác', 'failed-precondition', CANCEL_MSG.notCancellable],
    ['worker on an open job', { ...job, status: 'open' }, 'w1', 'Khác', 'failed-precondition', CANCEL_MSG.notCancellable],
    ['worker without a reason', job, 'w1', null, 'invalid-argument', CANCEL_MSG.reasonRequired],
  ] as const)('%s', (_l, data, uid, reason, code, message) =>
    expect(() => cancelParties('j1', data, uid, reason)).toThrow(expect.objectContaining({ code, message })));
  it('poster without a reason is fine; workerId null when the poster is the assignee', () => {
    expect(cancelParties('j1', job, 'p1', null)).toMatchObject({ role: 'poster', workerId: 'w1' });
    expect(cancelParties('j1', { ...job, assignedTo: ['p1'] }, 'p1', null).workerId).toBeNull();
  });
});

describe('planCancel', () => {
  const base = (role: 'poster' | 'worker', j: Record<string, unknown> = job) =>
    ({ role, info: toJobInfo('j1', j)!, workerId: 'w1', job: j, completion: undefined, payment: held, now: 0 });
  it('poster, open: cancelled, no penalty', () =>
    expect(planCancel({ ...base('poster', { ...job, status: 'open', assignedTo: [] }), workerId: null, payment: undefined })).toEqual({ next: 'cancelled', penalisedUid: null, points: 0, refund: false }));
  it('poster, in progress with held escrow: 5 points, refund', () =>
    expect(planCancel(base('poster'))).toEqual({ next: 'cancelled', penalisedUid: 'p1', points: 5, refund: true }));
  it('poster, in progress without a valid worker: no penalty', () =>
    expect(planCancel({ ...base('poster'), workerId: null, payment: undefined })).toEqual({ next: 'cancelled', penalisedUid: null, points: 0, refund: false }));
  it('worker, no deadline: open, 5 points, refund', () =>
    expect(planCancel(base('worker'))).toEqual({ next: 'open', penalisedUid: 'w1', points: 5, refund: true }));
  it('worker, deadline Timestamp in 6h: 20 points; a non-Timestamp deadline counts as none', () => {
    const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
    // normal client deadline: 23:59:59.999 +07:00 of the chosen day; now is 14h before it -> 10 points
    const endOfDay = { ...job, deadline: ts('2026-10-21T16:59:59.999Z'), createdAt: ts('2026-10-01T03:00:00Z') };
    expect(planCancel({ ...base('worker', endOfDay), now: Date.parse('2026-10-21T03:00:00Z') }).points).toBe(10);
    expect(planCancel({ ...base('worker', endOfDay), now: Date.parse('2026-10-21T11:00:00Z') }).points).toBe(20);
    expect(planCancel({ ...base('worker', { ...job, deadline: '2026-01-01' }) }).points).toBe(5);
  });
  it('worker, legacy date deadline (00:00 UTC) counts until the end of that Vietnam day, not 00:00 UTC', () => {
    const legacyDate = { ...job, deadline: Timestamp.fromDate(new Date('2026-10-20T00:00:00Z')), createdAt: Timestamp.fromDate(new Date('2026-10-01T03:00:00Z')) };
    // 20:00 UTC on the 19th: 4h to 00:00 UTC (raw would say 20), but 21h to the end of the 20th in Vietnam -> 10
    expect(planCancel({ ...base('worker', legacyDate), now: Date.parse('2026-10-19T20:00:00Z') }).points).toBe(10);
  });
  it('worker, legacy "no deadline" job (deadline = creation time): 5 points', () => {
    const created = Timestamp.fromDate(new Date('2026-10-01T05:00:00.137Z'));
    expect(planCancel({ ...base('worker', { ...job, deadline: created, createdAt: created }), now: created.toMillis() + 1000 }).points).toBe(5);
  });
  it.each([['poster', CANCEL_MSG.workerConfirmed], ['worker', CANCEL_MSG.workerReported]] as const)('%s after a trusted worker report is denied', (role, message) =>
    expect(() => planCancel({ ...base(role), completion: trusted })).toThrow(expect.objectContaining({ code: 'failed-precondition', message })));
  it('an untrusted legacy completion does not block', () =>
    expect(planCancel({ ...base('poster'), completion: { ...trusted, serverVersion: undefined } }).next).toBe('cancelled'));
  it.each([['payment disputed', { payment: { ...held, status: 'disputed' } }], ['job paymentStatus disputed', { job: { ...job, paymentStatus: 'disputed' }, payment: undefined }]])(
    '%s is denied', (_l, over) => expect(() => planCancel({ ...base('poster'), ...over })).toThrow(expect.objectContaining({ message: CANCEL_MSG.disputed })));
  it.each([['released', { ...held, status: 'released' }], ['forged (no source)', { ...held, source: undefined }], ['other payee', { ...held, payeeId: 'w9' }]])(
    '%s payment is not refunded', (_l, payment) => expect(planCancel({ ...base('poster'), payment }).refund).toBe(false));
});
