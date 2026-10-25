import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCompletionWritten } from '../../src/handlers/completions.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

describe('completion_requested on the emulator', () => {
  it('worker confirmation on jobCompletions/{jobId} creates exactly one request for the poster, also when redelivered', async () => {
    const poster = uid('poster');
    const worker = uid('worker');
    const jobId = uid('job');
    await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker] });
    const ref = db.doc(`jobCompletions/${jobId}`);
    await ref.set({ jobId, workerConfirmed: false, posterConfirmed: false, status: 'pending', completedAt: null });
    const before = (await ref.get()).data();
    await ref.update({ workerConfirmed: true });
    const after = (await ref.get()).data();
    await expect(handleCompletionWritten(db, jobId, before, after)).resolves.toBe(true);
    await expect(handleCompletionWritten(db, jobId, before, after)).resolves.toBe(false); // redelivery
    const docs = await notificationsFor(db, poster);
    expect(docs.map((d) => d.id)).toEqual([`completion_requested_${jobId}`]);
    expect(docs[0].data()).toMatchObject({
      message: '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.',
      jobId,
      source: 'server',
    });
    expect(await notificationsFor(db, worker)).toHaveLength(0);
  });

  it('a completion doc under another id (forged or legacy random id) sends nothing', async () => {
    const poster = uid('poster');
    const worker = uid('worker');
    const jobId = uid('job');
    await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker] });
    const completionId = uid('c');
    const ref = db.doc(`jobCompletions/${completionId}`);
    await ref.set({ jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null });
    await expect(handleCompletionWritten(db, completionId, undefined, (await ref.get()).data())).resolves.toBe(false);
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });
});
