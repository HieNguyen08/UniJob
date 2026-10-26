import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleDisputePayment } from '../../src/handlers/disputes.js';
import { handleEscrow, handleEscrowOnAssign, handleEscrowOnJobUpdate } from '../../src/handlers/payments.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});
afterEach(() => vi.restoreAllMocks());

const uid = (p: string) => `${p}_${randomUUID()}`;

/**
 * A job as the accept batch leaves it (in-progress, one assignee, application accepted),
 * with the before/after data of the open -> in-progress transition.
 */
async function assignedJob(job: Record<string, unknown> = {}, appStatus = 'accepted') {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  const data = {
    title: 'Nhập liệu', postedBy: poster, status: 'in-progress', payment: 150_000, paymentType: 'fixed',
    applicants: [worker], assignedTo: [worker], ...job,
  };
  await db.doc(`jobs/${jobId}`).set(data);
  await db.doc(`applications/${jobId}_${worker}`).set({ jobId, applicantId: worker, status: appStatus });
  return { poster, worker, jobId, before: { ...data, status: 'open', assignedTo: [] }, after: data };
}

const paymentOf = (jobId: string, worker: string) => db.doc(`payments/${jobId}_${worker}`).get();
const jobOf = async (jobId: string) => (await db.doc(`jobs/${jobId}`).get()).data();

describe('escrow hold on assignment (emulator)', () => {
  it('creates one held server payment and sets jobs.paymentStatus, idempotent under concurrent redelivery', async () => {
    const { poster, worker, jobId, before, after } = await assignedJob();
    const results = await Promise.all([
      handleEscrowOnAssign(db, jobId, before, after),
      handleEscrowOnAssign(db, jobId, before, after),
    ]);
    expect(results.sort()).toEqual(['created', 'exists']);
    const pay = await paymentOf(jobId, worker);
    expect(pay.data()).toMatchObject({
      jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500,
      netAmount: 145_500, status: 'held', method: 'platform_escrow', note: '', source: 'server', releasedAt: null,
    });
    expect(pay.get('heldAt')).toBeInstanceOf(Timestamp);
    expect(pay.get('createdAt')).toBeInstanceOf(Timestamp);
    expect((await jobOf(jobId))?.paymentStatus).toBe('held');
    const heldAt = pay.get('heldAt') as Timestamp;
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('exists');
    expect(((await paymentOf(jobId, worker)).get('heldAt') as Timestamp).isEqual(heldAt)).toBe(true);
  });

  it('a refunded server payment for the same payee is held again on re-assignment', async () => {
    const { worker, jobId, before, after } = await assignedJob();
    await handleEscrowOnAssign(db, jobId, before, after);
    await db.doc(`payments/${jobId}_${worker}`).update({ status: 'refunded', refundedAt: Timestamp.now() });
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('created');
    const pay = (await paymentOf(jobId, worker)).data();
    expect(pay).toMatchObject({ status: 'held', releasedAt: null });
    expect(pay?.refundedAt).toBeUndefined();
    expect((await jobOf(jobId))?.paymentStatus).toBe('held');
  });

  it.each(['released', 'disputed'])('a %s server payment is kept (exists)', async (status) => {
    const { worker, jobId, before, after } = await assignedJob();
    await handleEscrowOnAssign(db, jobId, before, after);
    await db.doc(`payments/${jobId}_${worker}`).update({ status });
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('exists');
    expect((await paymentOf(jobId, worker)).get('status')).toBe(status);
  });

  it('handleEscrow runs the hold for open -> in-progress', async () => {
    const { worker, jobId, before, after } = await assignedJob();
    await expect(handleEscrow(db, jobId, before, after)).resolves.toBe('created');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
  });

  it.each([
    ['volunteer', { paymentType: 'volunteer', payment: 50_000 }],
    ['zero amount', { payment: 0 }],
    ['oversized amount', { payment: 100_000_001 }],
    ['string amount', { payment: '150000' }],
  ])('%s: no payment, paymentStatus untouched', async (_l, job) => {
    const { worker, jobId, before, after } = await assignedJob(job);
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).exists).toBe(false);
    expect((await jobOf(jobId))?.paymentStatus).toBeUndefined();
  });

  it('skips when the application is not accepted (assigned without a matching accepted application)', async () => {
    const { worker, jobId, before, after } = await assignedJob({}, 'pending');
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).exists).toBe(false);
  });

  it('skips when the application document does not exist', async () => {
    const { worker, jobId, before, after } = await assignedJob();
    await db.doc(`applications/${jobId}_${worker}`).delete();
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('skipped');
  });

  it('skips with two assignees, and when the job is no longer in progress', async () => {
    const a = await assignedJob({ assignedTo: ['x', 'y'] });
    await expect(handleEscrowOnAssign(db, a.jobId, a.before, a.after)).resolves.toBe('skipped');
    const b = await assignedJob({ status: 'cancelled' });
    await expect(handleEscrowOnAssign(db, b.jobId, b.before, { ...b.after, status: 'in-progress' })).resolves.toBe('skipped');
    expect((await paymentOf(b.jobId, b.worker)).exists).toBe(false);
  });

  it('normalises the assignee list: an empty entry does not hide the single valid assignee', async () => {
    const { worker, jobId, before, after } = await assignedJob();
    const messy = { ...after, assignedTo: ['', worker] };
    await db.doc(`jobs/${jobId}`).update({ assignedTo: ['', worker] });
    await expect(handleEscrowOnAssign(db, jobId, before, messy)).resolves.toBe('created');
  });

  it('replaces a forged non-server doc at the deterministic id with the server record', async () => {
    const { poster, worker, jobId, before, after } = await assignedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payerId: worker, payeeId: worker, amount: 1, status: 'released' });
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('created');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ payerId: poster, amount: 150_000, status: 'held', source: 'server' });
  });

  it.each([
    ['payeeId', { payeeId: 'someone-else' }],
    ['payerId', { payerId: 'mallory' }],
    ['jobId', { jobId: 'other-job' }],
  ])('a forged source:server doc with a different %s is overwritten', async (_l, forged) => {
    const { poster, worker, jobId, before, after } = await assignedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payerId: poster, payeeId: worker, amount: 150_000, status: 'held', source: 'server', ...forged });
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('created');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ payerId: poster, payeeId: worker, jobId, amount: 150_000, source: 'server' });
  });

  it('a matching server doc is kept whatever its amount or status (idempotent), with a warning for a changed amount', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { poster, worker, jobId, before, after } = await assignedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payerId: poster, payeeId: worker, amount: 1, status: 'released', source: 'server' });
    await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('exists');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ amount: 1, status: 'released' });
    expect(warn).toHaveBeenCalledWith('escrow: held payment amount differs from the job', expect.objectContaining({ jobId }));
  });

  it('hold, dispute, poster edits jobs.payment, redelivered event: still disputed with the original amount', async () => {
    const { poster, worker, jobId, before, after } = await assignedJob();
    await handleEscrowOnAssign(db, jobId, before, after);
    await handleDisputePayment(db, poster, { jobId, reason: 'Người làm chưa giao bài đúng hạn' });
    await db.doc(`jobs/${jobId}`).update({ payment: 999 });
    await expect(handleEscrowOnAssign(db, jobId, before, { ...after, payment: 999 })).resolves.toBe('exists');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ status: 'disputed', amount: 150_000 });
  });
});

describe('escrow release on completion (emulator)', () => {
  async function held(job: Record<string, unknown> = {}) {
    const s = await assignedJob(job);
    await handleEscrowOnAssign(db, s.jobId, s.before, s.after);
    const jobBefore = await jobOf(s.jobId);
    return { ...s, jobBefore };
  }
  const moveTo = async (jobId: string, status: string) => {
    await db.doc(`jobs/${jobId}`).update({ status });
    return jobOf(jobId);
  };

  it('in-progress -> completed releases the held payment once, also when delivered twice', async () => {
    const { worker, jobId, jobBefore } = await held();
    const jobAfter = await moveTo(jobId, 'completed');
    const results = await Promise.all([
      handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter),
      handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter),
    ]);
    expect(results.sort()).toEqual(['released', 'skipped']);
    const pay = await paymentOf(jobId, worker);
    expect(pay.get('status')).toBe('released');
    expect(pay.get('releasedAt')).toBeInstanceOf(Timestamp);
    expect((await jobOf(jobId))?.paymentStatus).toBe('released');
  });

  it('handleEscrow runs the release for -> completed', async () => {
    const { worker, jobId, jobBefore } = await held();
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrow(db, jobId, jobBefore, jobAfter)).resolves.toBe('released');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('released');
  });

  it('the poster editing jobs.payment after the hold does not change the released amount', async () => {
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`jobs/${jobId}`).update({ payment: 1, status: 'completed' });
    const jobAfter = await jobOf(jobId);
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('released');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ status: 'released', amount: 150_000 });
  });

  it('releases to the normalised payee when assignedTo has an empty first entry', async () => {
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`jobs/${jobId}`).update({ assignedTo: ['', worker], status: 'completed' });
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, await jobOf(jobId))).resolves.toBe('released');
  });

  it('a disputed payment is not released', async () => {
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`payments/${jobId}_${worker}`).update({ status: 'disputed' });
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('disputed');
  });

  it('cancelling an in-progress job leaves the escrow held (no auto-refund, KNOWN HOLE 6 / slice 6)', async () => {
    const { worker, jobId, jobBefore } = await held();
    const jobAfter = await moveTo(jobId, 'cancelled');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
    expect((await jobOf(jobId))?.paymentStatus).toBe('held');
  });

  it('a forged non-server held doc is never released, and a paid job without a matching payment logs an error', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { worker, jobId } = await assignedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payeeId: worker, amount: 999, status: 'held' });
    const jobBefore = await jobOf(jobId);
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
    expect(error).toHaveBeenCalledWith('escrow: paid job completed without a matching server payment', expect.objectContaining({ jobId }));
  });

  it('a paid job completed with no payment at all logs an error', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { jobId } = await assignedJob();
    const jobBefore = await jobOf(jobId);
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zero amount', { amount: 0, netAmount: 0, platformFee: 0 }],
    ['amount above the cap', { amount: 100_000_001, netAmount: 100_000_001, platformFee: 0 }],
    ['net not amount minus fee', { netAmount: 1 }],
  ])('a server payment with %s is not released (warn + skip)', async (_l, bad) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`payments/${jobId}_${worker}`).update(bad);
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
    expect(warn).toHaveBeenCalledWith('escrow: payment amounts are inconsistent, not released', expect.objectContaining({ jobId }));
  });

  it.each([
    ['payeeId', { payeeId: 'someone-else' }],
    ['payerId', { payerId: 'mallory' }],
    ['jobId', { jobId: 'other-job' }],
  ])('a source:server doc with a different %s is not released', async (_l, forged) => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`payments/${jobId}_${worker}`).update(forged);
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
  });

  it('no payment (volunteer job) -> skipped without an error log', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { jobId } = await assignedJob({ paymentType: 'volunteer' });
    const jobBefore = await jobOf(jobId);
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect(error).not.toHaveBeenCalled();
  });
});
