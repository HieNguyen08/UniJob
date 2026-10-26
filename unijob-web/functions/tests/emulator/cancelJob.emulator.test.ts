import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCancelJob } from '../../src/handlers/cancelJob.js';
import { CANCEL_MSG } from '../../src/lib/cancel.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
let cancelJob: typeof import('../../src/callables/cancelJob.js').cancelJob;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
  ({ cancelJob } = await import('../../src/callables/cancelJob.js'));
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const rep = { ratingAverage: 4.5, ratingScore: 4.5, totalRatings: 2, penaltyPoints: 0 };

interface Seed { job?: Record<string, unknown>; held?: boolean; user?: Record<string, unknown>; noWorkerProfile?: boolean }
async function inProgressJob(seed: Seed = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`users/${poster}`).set({ ...rep, ...seed.user });
  if (!seed.noWorkerProfile) await db.doc(`users/${worker}`).set({ ...rep, ...seed.user });
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', category: 'Gia sư', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker],
    payment: 150_000, paymentType: 'fixed', deadline: null, ...(seed.held ? { paymentStatus: 'held' } : {}), ...seed.job,
  });
  await db.doc(`applications/${jobId}_${worker}`).set({ jobId, applicantId: worker, status: 'accepted' });
  if (seed.held) {
    await db.doc(`payments/${jobId}_${worker}`).set({
      jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500, netAmount: 145_500,
      status: 'held', method: 'platform_escrow', note: '', source: 'server', createdAt: Timestamp.now(), heldAt: Timestamp.now(), releasedAt: null,
    });
  }
  return {
    poster, worker, jobId,
    jobRef: db.doc(`jobs/${jobId}`), appRef: db.doc(`applications/${jobId}_${worker}`), payRef: db.doc(`payments/${jobId}_${worker}`),
  };
}
const completion = (jobId: string, fields: Record<string, unknown>) =>
  db.doc(`jobCompletions/${jobId}`).set({ jobId, source: 'server', serverVersion: 'completion-v1', ...fields });
const userOf = async (id: string) => (await db.doc(`users/${id}`).get()).data();

const verifiedRequest = (id: string, data: unknown, token: Record<string, unknown> = {}) =>
  ({
    data,
    auth: { uid: id, rawToken: '', token: { email: `${id}@hcmut.edu.vn`, email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...token } },
    rawRequest: {},
    acceptsStreaming: false,
  }) as unknown as CallableRequest<unknown>;

describe('handleCancelJob (emulator)', () => {
  it('worker cancels 6h before the deadline: job reopened, application withdrawn, escrow refunded, 20 points, poster notified', async () => {
    const deadline = Timestamp.fromDate(new Date('2026-10-21T16:59:59.999Z')); // 23:59:59.999 +07:00
    const now = deadline.toMillis() - 6 * 3_600_000;
    const s = await inProgressJob({ held: true, job: { deadline } });
    await expect(handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Lý do cá nhân khẩn cấp' }, () => now)).resolves.toEqual({ penaltyPoints: 20, status: 'open' });
    const j = (await s.jobRef.get()).data();
    expect(j).toMatchObject({ status: 'open', assignedTo: [], applicants: [], paymentStatus: 'refunded' });
    expect(j?.cancelledBy).toBeUndefined();
    expect((await s.appRef.get()).data()).toMatchObject({ status: 'rejected', withdrawnByWorker: true });
    const pay = (await s.payRef.get()).data();
    expect(pay?.status).toBe('refunded');
    expect(pay?.refundedAt).toBeInstanceOf(Timestamp);
    expect(await userOf(s.worker)).toMatchObject({ penaltyPoints: 20, ratingScore: 2.5, ratingAverage: 4.5 });
    expect((await userOf(s.worker))?.stub).toBeUndefined();
    const docs = await notificationsFor(db, s.poster);
    expect(docs.map((d) => d.id)).toEqual([`worker_cancelled_${s.jobId}_${s.worker}`]);
    expect(docs[0].data()).toMatchObject({ type: 'worker_cancelled', source: 'server', jobId: s.jobId, message: '⚠️ Người làm đã hủy nhận công việc "Nhập liệu". Công việc đã được mở lại để tìm người khác.' });
  });

  it('poster cancels an in-progress job with held escrow: cancelled, refunded, 5 points on the poster, worker application unchanged', async () => {
    const s = await inProgressJob({ held: true });
    await expect(handleCancelJob(db, s.poster, { jobId: s.jobId })).resolves.toEqual({ penaltyPoints: 5, status: 'cancelled' });
    const j = (await s.jobRef.get()).data();
    expect(j).toMatchObject({ status: 'cancelled', cancelledBy: 'poster', paymentStatus: 'refunded', assignedTo: [s.worker] });
    expect(j?.cancelledAt).toBeInstanceOf(Timestamp);
    expect(j?.cancelReason).toBeUndefined();
    expect((await s.payRef.get()).get('status')).toBe('refunded');
    expect(await userOf(s.poster)).toMatchObject({ penaltyPoints: 5, ratingScore: 4 });
    expect((await s.appRef.get()).get('status')).toBe('accepted');
    expect(await notificationsFor(db, s.poster)).toHaveLength(0);
  });

  it('poster cancels an open job: cancelled, 0 points, no profile write', async () => {
    const s = await inProgressJob({ job: { status: 'open', assignedTo: [], applicants: [] } });
    await expect(handleCancelJob(db, s.poster, { jobId: s.jobId })).resolves.toEqual({ penaltyPoints: 0, status: 'cancelled' });
    expect((await s.jobRef.get()).data()).toMatchObject({ status: 'cancelled', cancelledBy: 'poster' });
    expect(await userOf(s.poster)).toEqual(rep);
  });

  it('a legacy profile without ratingAverage: score from the old ratingScore', async () => {
    const s = await inProgressJob();
    await db.doc(`users/${s.poster}`).set({ ratingScore: 4.2 });
    await handleCancelJob(db, s.poster, { jobId: s.jobId });
    expect(await userOf(s.poster)).toMatchObject({ penaltyPoints: 5, ratingScore: 3.7 });
  });

  it.each([['poster', CANCEL_MSG.workerConfirmed], ['worker', CANCEL_MSG.workerReported]])('%s after the worker reported completion is denied, escrow stays held', async (who, message) => {
    const s = await inProgressJob({ held: true });
    await completion(s.jobId, { workerConfirmed: true, posterConfirmed: false, status: 'pending' });
    const caller = who === 'poster' ? s.poster : s.worker;
    await expect(handleCancelJob(db, caller, { jobId: s.jobId, reason: 'Khác' })).rejects.toMatchObject({ code: 'failed-precondition', message });
    expect((await s.jobRef.get()).get('status')).toBe('in-progress');
    expect((await s.payRef.get()).get('status')).toBe('held');
    expect((await userOf(caller))?.penaltyPoints).toBe(0);
  });

  it('a forged legacy completion (no server marker) does not block the poster', async () => {
    const s = await inProgressJob({ held: true });
    await db.doc(`jobCompletions/${s.jobId}`).set({ jobId: s.jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending' });
    await expect(handleCancelJob(db, s.poster, { jobId: s.jobId })).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('a disputed payment blocks both sides', async () => {
    const s = await inProgressJob({ held: true });
    await s.payRef.update({ status: 'disputed' });
    await s.jobRef.update({ paymentStatus: 'disputed' });
    for (const caller of [s.poster, s.worker]) {
      await expect(handleCancelJob(db, caller, { jobId: s.jobId, reason: 'Khác' })).rejects.toMatchObject({ code: 'failed-precondition', message: CANCEL_MSG.disputed });
    }
    expect((await s.jobRef.get()).get('status')).toBe('in-progress');
    expect((await s.payRef.get()).get('status')).toBe('disputed');
  });

  it('the worker double-clicks: one succeeds, the other is permission-denied, penalty applied once', async () => {
    const s = await inProgressJob({ held: true });
    const call = () => handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Khác' });
    const results = await Promise.allSettled([call(), call()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'permission-denied' });
    expect((await userOf(s.worker))?.penaltyPoints).toBe(5);
    expect(await notificationsFor(db, s.poster)).toHaveLength(1);
  });

  it('a missing penalised profile gets a server stub with the penalty', async () => {
    const s = await inProgressJob({ noWorkerProfile: true });
    await expect(handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Khác' })).resolves.toEqual({ penaltyPoints: 5, status: 'open' });
    expect((await s.jobRef.get()).get('status')).toBe('open');
    expect(await userOf(s.worker)).toEqual({
      uid: s.worker, stub: true, ratingAverage: 0, totalRatings: 0, ratingScore: 0, penaltyPoints: 5, activeJobCount: 0, completedJobs: 0,
    });
  });

  it.each([['outsider'], ['second assignee']])('%s is permission-denied and nothing changes', async (who) => {
    const s = await inProgressJob({ held: true });
    const other = uid('other');
    if (who === 'second assignee') await s.jobRef.update({ assignedTo: [s.worker, other] });
    await expect(handleCancelJob(db, other, { jobId: s.jobId, reason: 'Khác' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await s.jobRef.get()).get('status')).toBe('in-progress');
    expect((await s.payRef.get()).get('status')).toBe('held');
  });

  it.each([['completed', CANCEL_MSG.notCancellable], ['cancelled', CANCEL_MSG.alreadyCancelled]])('a %s job is failed-precondition', async (status, message) => {
    const s = await inProgressJob({ job: { status } });
    await expect(handleCancelJob(db, s.poster, { jobId: s.jobId })).rejects.toMatchObject({ code: 'failed-precondition', message });
  });

  it('the worker without a reason is invalid-argument (reasonRequired); a junk reason is invalidReason', async () => {
    const s = await inProgressJob();
    await expect(handleCancelJob(db, s.worker, { jobId: s.jobId })).rejects.toMatchObject({ code: 'invalid-argument', message: CANCEL_MSG.reasonRequired });
    await expect(handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'x' })).rejects.toMatchObject({ code: 'invalid-argument', message: CANCEL_MSG.invalidReason });
    expect((await s.jobRef.get()).get('status')).toBe('in-progress');
  });

  it('a missing job is not-found', async () => {
    await expect(handleCancelJob(db, uid('p'), { jobId: uid('nope') })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('cancelJob callable (emulator)', () => {
  it('the worker cancels through the callable', async () => {
    const s = await inProgressJob();
    await expect(cancelJob.run(verifiedRequest(s.worker, { jobId: s.jobId, reason: 'Khác' }))).resolves.toEqual({ penaltyPoints: 5, status: 'open' });
  });
  it.each([
    ['unverified', { email_verified: false }],
    ['non-HCMUT', { email: 'w@gmail.com' }],
    ['anonymous', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s worker is permission-denied and the job stays in progress', async (_l, token) => {
    const s = await inProgressJob();
    await expect(cancelJob.run(verifiedRequest(s.worker, { jobId: s.jobId, reason: 'Khác' }, token))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await s.jobRef.get()).get('status')).toBe('in-progress');
  });
});
