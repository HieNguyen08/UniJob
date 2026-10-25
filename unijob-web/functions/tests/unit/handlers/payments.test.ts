import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { handleEscrowOnJobUpdate, holdCandidate, planHeldPayment } from '../../../src/handlers/payments.js';

const job ={ title: 'Nhập liệu', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'], payment: 150_000, paymentType: 'fixed' };

describe('holdCandidate', () => {
  const open = { status: 'open', assignedTo: [] };
  const assigned = { status: 'in-progress', assignedTo: ['w1'] };
  it('open -> in-progress with exactly one valid assignee yields the payee', () => {
    expect(holdCandidate('j1', open, assigned)).toEqual({ payeeId: 'w1' });
  });
  it('normalises the assignee list (empty and non-string entries are ignored)', () => {
    expect(holdCandidate('j1', open, { ...assigned, assignedTo: ['', 7, 'w1'] })).toEqual({ payeeId: 'w1' });
  });
  it.each([
    ['already in progress', assigned, assigned, 'j1'],
    ['from completed', { status: 'completed' }, assigned, 'j1'],
    ['two assignees', open, { ...assigned, assignedTo: ['w1', 'w2'] }, 'j1'],
    ['no assignee', open, { ...assigned, assignedTo: [] }, 'j1'],
    ['assignee id with a slash', open, { ...assigned, assignedTo: ['a/b'] }, 'j1'],
    ['still open', open, { ...open, assignedTo: ['w1'] }, 'j1'],
    ['jobId with a slash', open, assigned, 'a/b'],
    ['no before', undefined, assigned, 'j1'],
    ['no after', open, undefined, 'j1'],
  ])('is null for %s', (_l, before, after, jobId) => {
    expect(holdCandidate(jobId, before, after)).toBeNull();
  });
});

describe('planHeldPayment', () => {
  it('builds the held record with fee and net amount from the job', () => {
    expect(planHeldPayment('j1', 'w1', job)).toEqual({
      ok: true,
      payment: {
        jobId: 'j1', jobTitle: 'Nhập liệu', payerId: 'p1', payeeId: 'w1',
        amount: 150_000, platformFee: 4_500, netAmount: 145_500,
        status: 'held', method: 'platform_escrow', note: '', source: 'server',
      },
    });
  });
  it('sanitises the title and falls back to "công việc"', () => {
    const plan = (title: unknown) => planHeldPayment('j1', 'w1', { ...job, title });
    expect(plan('Xem www.evil.com')).toMatchObject({ payment: { jobTitle: 'Xem [liên kết]' } });
    expect(plan('   ')).toMatchObject({ payment: { jobTitle: 'công việc' } });
    expect(plan('t'.repeat(5000))).toMatchObject({ ok: true });
  });
  it.each([
    ['job_missing', undefined],
    ['job_not_in_progress', { ...job, status: 'open' }],
    ['not_assigned', { ...job, assignedTo: ['someoneElse'] }],
    ['bad_poster', { ...job, postedBy: '' }],
    ['bad_poster', { ...job, postedBy: 'w1' }],
    ['volunteer', { ...job, paymentType: 'volunteer' }],
    ['invalid_amount', { ...job, payment: '150000' }],
    ['over_cap', { ...job, payment: 100_000_001 }],
  ])('skips with %s', (reason, data) => {
    expect(planHeldPayment('j1', 'w1', data)).toEqual({ ok: false, reason });
  });
});

describe('handleEscrowOnJobUpdate without a completion transition', () => {
  const db = {} as Firestore; // must not touch the db
  const job = { postedBy: 'p1', assignedTo: ['w1'], status: 'in-progress' };
  it.each([
    ['status unchanged', job, { ...job, paymentStatus: 'held' }],
    ['already completed', { ...job, status: 'completed' }, { ...job, status: 'completed', paymentStatus: 'released' }],
    ['cancelled (no auto-refund, KNOWN HOLE 6)', job, { ...job, status: 'cancelled' }],
    ['no worker', { ...job, assignedTo: [] }, { ...job, assignedTo: [], status: 'completed' }],
    ['worker id with a slash', { ...job, assignedTo: ['a/b'] }, { ...job, assignedTo: ['a/b'], status: 'completed' }],
    ['no before', undefined, { ...job, status: 'completed' }],
  ])('%s -> skipped', async (_l, before, after) => {
    await expect(handleEscrowOnJobUpdate(db, 'j1', before, after)).resolves.toBe('skipped');
  });
});
