import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleJobUpdated } from '../../src/handlers/jobs.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function transition(status: 'cancelled' | 'completed') {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  const ref = db.doc(`jobs/${jobId}`);
  await ref.set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', applicants: [worker], assignedTo: [worker] });
  const before = (await ref.get()).data();
  await ref.update({ status });
  const after = (await ref.get()).data();
  return { poster, worker, jobId, before, after };
}

describe('job status notifications on the emulator', () => {
  it('cancel: exactly one job_cancelled for the worker, none for the poster, idempotent', async () => {
    const { poster, worker, jobId, before, after } = await transition('cancelled');
    await expect(handleJobUpdated(db, jobId, before, after)).resolves.toBe(1);
    await expect(handleJobUpdated(db, jobId, before, after)).resolves.toBe(0);
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`job_cancelled_${jobId}_${worker}`]);
    expect(docs[0].data()).toMatchObject({ message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', jobId, source: 'server' });
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });

  it('complete: exactly one job_completed each for worker and poster, idempotent under concurrency', async () => {
    const { poster, worker, jobId, before, after } = await transition('completed');
    const counts = await Promise.all([handleJobUpdated(db, jobId, before, after), handleJobUpdated(db, jobId, before, after)]);
    expect(counts[0] + counts[1]).toBe(2);
    expect((await notificationsFor(db, worker)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${worker}`]);
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${poster}`]);
  });
});
