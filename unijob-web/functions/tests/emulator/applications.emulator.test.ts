import { randomUUID } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleApplicationCreated, handleApplicationUpdated } from '../../src/handlers/applications.js';
import type { AuthNameOf } from '../../src/lib/authName.js';
import { connectEmulatorAuth, createGoogleUser, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
let auth: Auth;
let authNameOf: AuthNameOf;
beforeAll(async () => {
  ({ db, auth, authNameOf } = await connectEmulatorAuth());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function seed() {
  const poster = uid('poster');
  const applicant = uid('carol');
  const jobId = uid('job');
  const appId = `${jobId}_${applicant}`;
  await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'open', applicants: [applicant], assignedTo: [] });
  await createGoogleUser(auth, applicant, 'Carol');
  // applicantName is client-written: the server must sign with the Auth name instead.
  await db.doc(`applications/${appId}`).set({ jobId, applicantId: applicant, applicantName: 'Phòng Đào tạo HCMUT', applicantPhoto: '', message: 'hi', status: 'pending' });
  return { poster, applicant, jobId, appId };
}

describe('application notifications on the emulator', () => {
  it('a new application creates exactly one new_application for the poster, signed with the Auth name, also when delivered twice', async () => {
    const { poster, jobId, appId } = await seed();
    const data = (await db.doc(`applications/${appId}`).get()).data();
    await expect(handleApplicationCreated(db, appId, data, authNameOf)).resolves.toBe(true);
    await expect(handleApplicationCreated(db, appId, data, authNameOf)).resolves.toBe(false);
    const docs = await notificationsFor(db, poster);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(`new_application_${appId}`);
    expect(docs[0].data()).toMatchObject({
      type: 'new_application',
      message: 'Carol đã ứng tuyển "Nhập liệu"',
      jobId,
      jobTitle: 'Nhập liệu',
      fromName: 'Carol',
      read: false,
      source: 'server',
    });
  });

  it('accepting creates exactly one application_accepted for the applicant (concurrent redelivery)', async () => {
    const { applicant, appId } = await seed();
    const before = (await db.doc(`applications/${appId}`).get()).data();
    await db.doc(`applications/${appId}`).update({ status: 'accepted' });
    const after = (await db.doc(`applications/${appId}`).get()).data();
    const results = await Promise.all([
      handleApplicationUpdated(db, appId, before, after),
      handleApplicationUpdated(db, appId, before, after),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const docs = await notificationsFor(db, applicant);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(`application_accepted_${appId}`);
    expect(docs[0].get('message')).toBe('🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!');
  });

  it('rejecting creates exactly one application_rejected', async () => {
    const { applicant, appId } = await seed();
    const before = (await db.doc(`applications/${appId}`).get()).data();
    await db.doc(`applications/${appId}`).update({ status: 'rejected' });
    const after = (await db.doc(`applications/${appId}`).get()).data();
    await handleApplicationUpdated(db, appId, before, after);
    await handleApplicationUpdated(db, appId, before, after);
    const docs = await notificationsFor(db, applicant);
    expect(docs.map((d) => d.id)).toEqual([`application_rejected_${appId}`]);
  });

  it('a 5000-character title is clipped in the message and the write succeeds', async () => {
    const { poster, jobId, appId } = await seed();
    await db.doc(`jobs/${jobId}`).update({ title: '"'.repeat(5000) });
    await handleApplicationCreated(db, appId, (await db.doc(`applications/${appId}`).get()).data(), authNameOf);
    const [doc] = await notificationsFor(db, poster);
    expect(Array.from(doc.get('message') as string).length).toBeLessThan(200);
  });
});
