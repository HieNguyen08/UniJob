import { randomUUID } from 'node:crypto';
import { initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeNotification, type NotificationInput } from '../../src/lib/notifications.js';
import { assertAppProject, assertEmulatorEnv } from '../support/emulator.js';

let app: App;
let db: Firestore;

beforeAll(async () => {
  assertEmulatorEnv();
  // Explicit demo- projectId (validated above); src/admin.ts reuses this app instead of calling initializeApp() itself.
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  ({ app, db } = await import('../../src/admin.js')); // only after the guard
  assertAppProject(app);
});

// Unique source ids per run instead of clearing the database between tests.
const input = (sourceId: string, message = 'Có ứng viên mới'): NotificationInput => ({
  userId: 'poster',
  type: 'new_application',
  message,
  extras: { jobId: 'job1' },
  sourceId,
});
const docOf = (sourceId: string) => db.collection('notifications').doc(`new_application_${sourceId}`);

describe('writeNotification on the Firestore emulator', () => {
  it('a duplicate event with the same sourceId is a no-op', async () => {
    const id = `test_${randomUUID()}`;
    await expect(writeNotification(db, input(id))).resolves.toBe(true);
    await expect(writeNotification(db, input(id, 'tin nhắn khác'))).resolves.toBe(false);
    const snap = await docOf(id).get();
    expect(snap.data()).toMatchObject({ userId: 'poster', message: 'Có ứng viên mới', read: false, source: 'server', jobId: 'job1' });
    expect(snap.get('createdAt')).toBeInstanceOf(Timestamp);
  });

  it('concurrent duplicates create exactly one notification', async () => {
    const id = `test_${randomUUID()}`;
    const results = await Promise.all([writeNotification(db, input(id)), writeNotification(db, input(id))]);
    expect(results.sort()).toEqual([false, true]);
    const docs = await db.collection('notifications').where('__name__', '==', docOf(id)).get();
    expect(docs.size).toBe(1);
  });

  it('replaces a document squatted by a client (no source) with the real notification', async () => {
    const id = `test_${randomUUID()}`;
    await docOf(id).set({ userId: 'poster', type: 'new_application', message: 'giả mạo', read: true });
    await expect(writeNotification(db, input(id))).resolves.toBe(true);
    const data = (await docOf(id).get()).data();
    expect(data).toMatchObject({ message: 'Có ứng viên mới', read: false, source: 'server' });
    await expect(writeNotification(db, input(id))).resolves.toBe(false);
  });

  it('writes to the named database kirigitejkf8095h, not (default)', async () => {
    const id = `test_${randomUUID()}`;
    await writeNotification(db, input(id));
    expect((await docOf(id).get()).exists).toBe(true);
    expect((await getFirestore(app).collection('notifications').doc(`new_application_${id}`).get()).exists).toBe(false);
  });
});
