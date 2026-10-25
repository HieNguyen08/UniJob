import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCompletionWritten } from '../../src/handlers/completions.js';
import { handleConfirmCompletion } from '../../src/handlers/confirmCompletion.js';
import { handleJobUpdated } from '../../src/handlers/jobs.js';
import { handleEscrow } from '../../src/handlers/payments.js';
import { COMPLETION_MSG } from '../../src/lib/completion.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

/** In-progress job with an accepted application; `held` also seeds the server escrow payment (as in disputes tests). */
async function inProgressJob({ held = false, ...job }: { held?: boolean } & Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', category: 'Gia sư', postedBy: poster, status: 'in-progress',
    assignedTo: [worker], applicants: [worker], payment: 150_000, paymentType: 'fixed',
    ...(held ? { paymentStatus: 'held' } : {}), ...job,
  });
  await db.doc(`applications/${jobId}_${worker}`).set({ jobId, applicantId: worker, status: 'accepted' });
  if (held) {
    await db.doc(`payments/${jobId}_${worker}`).set({
      jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500, netAmount: 145_500,
      status: 'held', method: 'platform_escrow', note: '', source: 'server', createdAt: Timestamp.now(), heldAt: Timestamp.now(), releasedAt: null,
    });
  }
  return { poster, worker, jobId, jobRef: db.doc(`jobs/${jobId}`), completionRef: db.doc(`jobCompletions/${jobId}`) };
}

describe('server completion through the existing triggers (emulator)', () => {
  it('worker confirms, poster confirms: completion_requested once, job_completed to both, escrow released, one work history', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob({ held: true });
    await handleConfirmCompletion(db, worker, { jobId });
    await expect(handleCompletionWritten(db, jobId, undefined, (await completionRef.get()).data())).resolves.toBe(true);
    const cBefore = (await completionRef.get()).data();
    const jobBefore = (await jobRef.get()).data();
    await handleConfirmCompletion(db, poster, { jobId });
    await expect(handleCompletionWritten(db, jobId, cBefore, (await completionRef.get()).data())).resolves.toBe(false);
    const jobAfter = (await jobRef.get()).data();
    await handleJobUpdated(db, jobId, jobBefore, jobAfter);
    await expect(handleEscrow(db, jobId, jobBefore, jobAfter)).resolves.toBe('released');
    expect((await db.doc(`payments/${jobId}_${worker}`).get()).get('status')).toBe('released');
    expect((await jobRef.get()).get('paymentStatus')).toBe('released');
    expect((await notificationsFor(db, poster)).map((d) => d.id).sort()).toEqual([`completion_requested_${jobId}`, `job_completed_${jobId}_${poster}`].sort());
    expect((await notificationsFor(db, worker)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${worker}`]);
    expect((await db.collection('workHistory').where('jobId', '==', jobId).get()).size).toBe(1);
  });

  it('an old-client doc is replaced by the worker, so completion_requested is sent once and escrow is still released; a forged poster flag completes nothing', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob({ held: true });
    await completionRef.set({ jobId, workerConfirmed: false, posterConfirmed: true, status: 'pending', completedAt: null });
    await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst });
    const legacy = (await completionRef.get()).data();
    await handleConfirmCompletion(db, worker, { jobId });
    expect((await jobRef.get()).get('status')).toBe('in-progress');
    await expect(handleCompletionWritten(db, jobId, legacy, (await completionRef.get()).data())).resolves.toBe(true);
    const cBefore = (await completionRef.get()).data();
    const jobBefore = (await jobRef.get()).data();
    await handleConfirmCompletion(db, poster, { jobId });
    await expect(handleCompletionWritten(db, jobId, cBefore, (await completionRef.get()).data())).resolves.toBe(false);
    const jobAfter = (await jobRef.get()).data();
    expect(jobAfter?.status).toBe('completed');
    await expect(handleEscrow(db, jobId, jobBefore, jobAfter)).resolves.toBe('released');
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toContain(`completion_requested_${jobId}`);
  });

  it('a volunteer job completes without a payment and without an error', async () => {
    const { poster, worker, jobId, jobRef } = await inProgressJob({ paymentType: 'volunteer', payment: 0 });
    await handleConfirmCompletion(db, worker, { jobId });
    const jobBefore = (await jobRef.get()).data();
    await handleConfirmCompletion(db, poster, { jobId });
    const jobAfter = (await jobRef.get()).data();
    expect(jobAfter?.status).toBe('completed');
    await expect(handleEscrow(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await db.doc(`payments/${jobId}_${worker}`).get()).exists).toBe(false);
  });
});
