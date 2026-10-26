import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleApplicationUpdated } from '../../src/handlers/applications.js';
import { handleCancelJob } from '../../src/handlers/cancelJob.js';
import { handleJobCounters } from '../../src/handlers/counters.js';
import { handleJobUpdated } from '../../src/handlers/jobs.js';
import { handleEscrow } from '../../src/handlers/payments.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

/** An in-progress job with held escrow, an accepted application and a counters marker (as the triggers leave it). */
async function flowJob() {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  const rep = { ratingAverage: 4.5, ratingScore: 4.5, totalRatings: 2, penaltyPoints: 0 };
  await db.doc(`users/${poster}`).set({ ...rep, activeJobCount: 0 });
  await db.doc(`users/${worker}`).set({ ...rep, activeJobCount: 1 });
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker],
    payment: 150_000, paymentType: 'fixed', deadline: null, paymentStatus: 'held',
  });
  await db.doc(`applications/${jobId}_${worker}`).set({ jobId, applicantId: worker, status: 'accepted' });
  await db.doc(`payments/${jobId}_${worker}`).set({
    jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500, netAmount: 145_500,
    status: 'held', method: 'platform_escrow', note: '', source: 'server', createdAt: Timestamp.now(), heldAt: Timestamp.now(), releasedAt: null,
  });
  await db.doc(`jobCounters/${jobId}`).set({ activeWorker: worker, completedWorker: null });
  const jobRef = db.doc(`jobs/${jobId}`);
  const appRef = db.doc(`applications/${jobId}_${worker}`);
  return { poster, worker, jobId, jobRef, appRef, payRef: db.doc(`payments/${jobId}_${worker}`) };
}
type Flow = Awaited<ReturnType<typeof flowJob>>;

/** Runs `act` and feeds the job and application snapshots around it to the existing handlers. */
async function around(s: Flow, act: () => Promise<unknown>) {
  const jobBefore = (await s.jobRef.get()).data();
  const appBefore = (await s.appRef.get()).data();
  await act();
  const jobAfter = (await s.jobRef.get()).data();
  const appAfter = (await s.appRef.get()).data();
  return {
    jobNotifications: await handleJobUpdated(db, s.jobId, jobBefore, jobAfter),
    escrow: await handleEscrow(db, s.jobId, jobBefore, jobAfter),
    appNotified: await handleApplicationUpdated(db, `${s.jobId}_${s.worker}`, appBefore, appAfter),
    counters: await handleJobCounters(db, s.jobId, jobBefore, jobAfter),
  };
}
const activeOf = async (id: string) => (await db.doc(`users/${id}`).get()).get('activeJobCount');

describe('cancel flow through the existing triggers (emulator)', () => {
  it('worker cancel: no job_cancelled, no escrow change, no application_rejected, counter back to 0', async () => {
    const s = await flowJob();
    const out = await around(s, () => handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Khác' }));
    expect(out).toMatchObject({ jobNotifications: 0, escrow: 'skipped', appNotified: false, counters: 'updated' });
    expect(await activeOf(s.worker)).toBe(0);
    expect(await notificationsFor(db, s.worker)).toHaveLength(0);
    expect((await notificationsFor(db, s.poster)).map((d) => d.get('type'))).toEqual(['worker_cancelled']);
    expect((await s.payRef.get()).get('status')).toBe('refunded');
  });

  it('poster cancel of an in-progress job: job_cancelled to the worker once, payment stays refunded, counter 0', async () => {
    const s = await flowJob();
    const out = await around(s, () => handleCancelJob(db, s.poster, { jobId: s.jobId }));
    expect(out).toMatchObject({ jobNotifications: 1, escrow: 'skipped', counters: 'updated' });
    expect((await notificationsFor(db, s.worker)).map((d) => d.get('type'))).toEqual(['job_cancelled']);
    expect((await s.payRef.get()).get('status')).toBe('refunded');
    expect(await activeOf(s.worker)).toBe(0);
  });

  it('the same worker re-assigned after cancelling: escrow is held again and the counter returns to 1', async () => {
    const s = await flowJob();
    await around(s, () => handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Khác' }));
    // the poster accepts the same worker again (simulated with the Admin db)
    await s.appRef.update({ status: 'accepted', withdrawnByWorker: false });
    const before = (await s.jobRef.get()).data();
    await s.jobRef.update({ status: 'in-progress', assignedTo: [s.worker] });
    const after = (await s.jobRef.get()).data();
    await expect(handleEscrow(db, s.jobId, before, after)).resolves.toBe('created');
    expect((await s.payRef.get()).get('status')).toBe('held');
    await expect(handleJobCounters(db, s.jobId, before, after)).resolves.toBe('updated');
    expect(await activeOf(s.worker)).toBe(1);
  });
});
