import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleConfirmCompletion } from '../../src/handlers/confirmCompletion.js';
import { COMPLETION_MSG } from '../../src/lib/completion.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
let confirmCompletion: typeof import('../../src/callables/confirmCompletion.js').confirmCompletion;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
  ({ confirmCompletion } = await import('../../src/callables/confirmCompletion.js'));
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function inProgressJob(job: Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', category: 'Gia sư', postedBy: poster, status: 'in-progress',
    assignedTo: [worker], applicants: [worker], payment: 150_000, paymentType: 'fixed', ...job,
  });
  return {
    poster, worker, jobId,
    jobRef: db.doc(`jobs/${jobId}`),
    completionRef: db.doc(`jobCompletions/${jobId}`),
    historyRef: db.doc(`workHistory/${jobId}_${worker}`),
  };
}
const historyCount = async (jobId: string) => (await db.collection('workHistory').where('jobId', '==', jobId).get()).size;
const confirmed = { status: 'confirmed', workerConfirmed: true, posterConfirmed: true };

describe('confirmCompletion handler (emulator)', () => {
  it('worker first creates a pending server record; the job stays in progress', async () => {
    const { worker, jobId, jobRef, completionRef, historyRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    const c = (await completionRef.get()).data();
    expect(c).toMatchObject({ jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null, source: 'server', serverVersion: 'completion-v1' });
    expect(c?.createdAt).toBeInstanceOf(Timestamp);
    expect(c?.updatedAt).toBeInstanceOf(Timestamp);
    expect((await jobRef.get()).get('status')).toBe('in-progress');
    expect((await historyRef.get()).exists).toBe(false);
  });

  it('poster first is failed-precondition and writes nothing', async () => {
    const { poster, jobId, completionRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it('poster second: completion confirmed, job completed, one work history entry', async () => {
    const { poster, worker, jobId, jobRef, completionRef, historyRef } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    await expect(handleConfirmCompletion(db, poster, { jobId })).resolves.toEqual(confirmed);
    const c = (await completionRef.get()).data();
    expect(c).toMatchObject({ ...confirmed });
    expect(c?.completedAt).toBeInstanceOf(Timestamp);
    const j = (await jobRef.get()).data();
    expect(j?.status).toBe('completed');
    expect(j?.updatedAt).toBeInstanceOf(Timestamp);
    const h = (await historyRef.get()).data();
    expect(h).toMatchObject({ user1: poster, user2: worker, jobId, jobTitle: 'Nhập liệu', category: 'Gia sư', source: 'server', serverVersion: 'completion-v1' });
    expect(h?.completedAt).toBeInstanceOf(Timestamp);
  });

  it('an old-client doc (both false) is untrusted: poster is workerFirst, worker overwrites it as a server record', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob();
    await completionRef.set({ jobId, workerConfirmed: false, posterConfirmed: false, status: 'pending', completedAt: null, createdAt: Timestamp.now() });
    await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst });
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect((await completionRef.get()).data()).toMatchObject({ source: 'server', serverVersion: 'completion-v1', workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null });
    await expect(handleConfirmCompletion(db, poster, { jobId })).resolves.toEqual(confirmed);
    expect((await jobRef.get()).get('status')).toBe('completed');
    expect(await historyCount(jobId)).toBe(1);
  });

  it('a forged legacy doc (posterConfirmed true, no source) cannot let the worker complete alone', async () => {
    const { worker, jobId, jobRef, completionRef, historyRef } = await inProgressJob();
    await completionRef.set({ jobId, workerConfirmed: false, posterConfirmed: true, status: 'pending', completedAt: null });
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect((await jobRef.get()).get('status')).toBe('in-progress');
    expect((await historyRef.get()).exists).toBe(false);
  });

  it('an idempotent repeat writes nothing', async () => {
    const { worker, jobId, completionRef } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    const updatedAt = (await completionRef.get()).get('updatedAt') as Timestamp;
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect(((await completionRef.get()).get('updatedAt') as Timestamp).isEqual(updatedAt)).toBe(true);
  });

  it('concurrent second confirmations: one completes the job, the other is alreadyCompleted, one work history', async () => {
    const { poster, worker, jobId } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    const results = await Promise.allSettled([handleConfirmCompletion(db, poster, { jobId }), handleConfirmCompletion(db, poster, { jobId })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'failed-precondition', message: COMPLETION_MSG.alreadyCompleted } });
    expect(await historyCount(jobId)).toBe(1);
  });

  it('a legacy doc already "confirmed" (no source) while the job is in progress is not trusted', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob();
    await completionRef.set({ jobId, workerConfirmed: true, posterConfirmed: true, status: 'confirmed', completedAt: Timestamp.fromMillis(1_700_000_000_000) });
    await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst });
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toMatchObject({ status: 'pending' });
    expect((await jobRef.get()).get('status')).toBe('in-progress');
    expect(await historyCount(jobId)).toBe(0);
  });

  it('a pre-existing work history doc at that id is overwritten, whatever its fields', async () => {
    for (const forged of [{}, { source: 'server' }, { source: 'server', user1: 'mallory' }, { source: 'server', completedAt: 'x' }]) {
      const t = await inProgressJob();
      await t.historyRef.set({ user1: t.poster, user2: t.worker, jobId: t.jobId, jobTitle: 'Giả', category: '', completedAt: Timestamp.fromMillis(1_700_000_000_000), ...forged });
      await handleConfirmCompletion(db, t.worker, { jobId: t.jobId });
      await handleConfirmCompletion(db, t.poster, { jobId: t.jobId });
      const h = (await t.historyRef.get()).data();
      expect(h).toMatchObject({ user1: t.poster, user2: t.worker, jobId: t.jobId, jobTitle: 'Nhập liệu', source: 'server', serverVersion: 'completion-v1' });
      expect(h?.completedAt).toBeInstanceOf(Timestamp);
      expect((h?.completedAt as Timestamp).toMillis()).toBeGreaterThan(1_700_000_000_000);
    }
  });

  it('a completion doc with source server but no version marker, or another jobId, is untrusted', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob();
    for (const doc of [{ jobId }, { jobId: 'other', serverVersion: 'completion-v1' }]) {
      await completionRef.set({ workerConfirmed: true, posterConfirmed: true, status: 'confirmed', completedAt: null, source: 'server', ...doc });
      await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ message: COMPLETION_MSG.workerFirst });
      await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toMatchObject({ status: 'pending', posterConfirmed: false });
      expect((await jobRef.get()).get('status')).toBe('in-progress');
    }
  });

  it('outsider and second assignee are permission-denied and nothing changes', async () => {
    const { worker, jobId, jobRef, completionRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, uid('mallory'), { jobId })).rejects.toMatchObject({ code: 'permission-denied' });
    const other = uid('worker2');
    await jobRef.update({ assignedTo: [worker, other] });
    await expect(handleConfirmCompletion(db, other, { jobId })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it.each([
    ['open', COMPLETION_MSG.notInProgress],
    ['cancelled', COMPLETION_MSG.notInProgress],
    ['completed', COMPLETION_MSG.alreadyCompleted],
  ])('a %s job is failed-precondition and nothing changes', async (status, message) => {
    const { worker, jobId, completionRef } = await inProgressJob({ status });
    await expect(handleConfirmCompletion(db, worker, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it('a missing job is not-found, a bad id invalid-argument', async () => {
    await expect(handleConfirmCompletion(db, uid('w'), { jobId: uid('nojob') })).rejects.toMatchObject({ code: 'not-found' });
    await expect(handleConfirmCompletion(db, uid('w'), { jobId: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

const verifiedRequest = (id: string, data: unknown, token: Record<string, unknown> = {}) =>
  ({
    data,
    auth: { uid: id, rawToken: '', token: { email: `${id}@hcmut.edu.vn`, email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...token } },
    rawRequest: {},
    acceptsStreaming: false,
  }) as unknown as CallableRequest<unknown>;

describe('confirmCompletion callable (emulator)', () => {
  it('worker then poster through the callable completes the job', async () => {
    const { poster, worker, jobId, jobRef } = await inProgressJob();
    await expect(confirmCompletion.run(verifiedRequest(worker, { jobId }))).resolves.toMatchObject({ status: 'pending' });
    await expect(confirmCompletion.run(verifiedRequest(poster, { jobId }))).resolves.toEqual(confirmed);
    expect((await jobRef.get()).get('status')).toBe('completed');
  });

  it.each([
    ['unverified email', { email_verified: false }],
    ['non-HCMUT email', { email: 'worker@gmail.com' }],
    ['anonymous user', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s: the assigned worker is refused with permission-denied and nothing is written', async (_l, token) => {
    const { worker, jobId, completionRef } = await inProgressJob();
    await expect(confirmCompletion.run(verifiedRequest(worker, { jobId }, token))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await completionRef.get()).exists).toBe(false);
  });
});
