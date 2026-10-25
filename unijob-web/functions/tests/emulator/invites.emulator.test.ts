import { randomUUID } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleSendJobInvite } from '../../src/handlers/invites.js';
import type { AuthNameOf } from '../../src/lib/authName.js';
import { connectEmulatorAuth, createGoogleUser, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
let auth: Auth;
let authNameOf: AuthNameOf;
beforeAll(async () => {
  ({ db, auth, authNameOf } = await connectEmulatorAuth());
});
const invite = (uid: string, data: unknown) => handleSendJobInvite(db, uid, data, authNameOf);

const uid = (p: string) => `${p}_${randomUUID()}`;

describe('sendJobInvite on the emulator', () => {
  it('creates exactly one job_invite per worker and job, signed with the caller Auth name; a repeat returns sent: false', async () => {
    const poster = uid('alice');
    const worker = uid('bob');
    const jobId = uid('job');
    await createGoogleUser(auth, poster, '  Alice  ', 'Phòng Đào tạo HCMUT');
    // users/{uid}.displayName is user-editable: it must not be used either.
    await db.doc(`users/${poster}`).set({ uid: poster, displayName: 'Ban Giám hiệu' });
    await db.doc(`users/${worker}`).set({ uid: worker, displayName: 'Bob' });
    // postedByName is client-written: the server must sign with the caller's Auth name instead.
    await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, postedByName: 'Phòng Đào tạo HCMUT', isAnonymous: false, status: 'open', applicants: [], assignedTo: [] });
    await expect(invite(poster, { jobId, workerId: worker })).resolves.toEqual({ sent: true });
    await expect(invite(poster, { jobId, workerId: worker })).resolves.toEqual({ sent: false });
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`job_invite_${jobId}_${worker}`]);
    expect(docs[0].data()).toMatchObject({ message: 'Alice mời bạn ứng tuyển "Nhập liệu"', fromName: 'Alice', jobId, source: 'server' });
  });

  it("an anonymous job is signed 'Ẩn danh', never with the poster's name", async () => {
    const poster = uid('alice');
    const worker = uid('bob');
    const jobId = uid('job');
    await db.doc(`users/${poster}`).set({ uid: poster, displayName: 'Alice' });
    await db.doc(`users/${worker}`).set({ uid: worker });
    await db.doc(`jobs/${jobId}`).set({ title: 'Bí mật', postedBy: poster, postedByName: 'Ẩn danh', isAnonymous: true, status: 'open', applicants: [], assignedTo: [] });
    await expect(invite(poster, { jobId, workerId: worker })).resolves.toEqual({ sent: true });
    const docs = await notificationsFor(db, worker);
    expect(docs[0].data()).toMatchObject({ message: 'Ẩn danh mời bạn ứng tuyển "Bí mật"', fromName: 'Ẩn danh' });
  });

  it("a poster without an Auth name is signed 'Người đăng việc'", async () => {
    const poster = uid('alice');
    const worker = uid('bob');
    const jobId = uid('job');
    await db.doc(`users/${poster}`).set({ uid: poster, displayName: 'Alice' });
    await db.doc(`users/${worker}`).set({ uid: worker });
    await db.doc(`jobs/${jobId}`).set({ title: 'T', postedBy: poster, postedByName: 'Alice', isAnonymous: false, status: 'open', applicants: [], assignedTo: [] });
    await expect(invite(poster, { jobId, workerId: worker })).resolves.toEqual({ sent: true });
    const [doc] = await notificationsFor(db, worker);
    expect(doc.data()).toMatchObject({ message: 'Người đăng việc mời bạn ứng tuyển "T"', fromName: 'Người đăng việc' });
  });

  it('a non-poster gets permission-denied and nothing is written', async () => {
    const worker = uid('bob');
    const jobId = uid('job');
    await db.doc(`users/${worker}`).set({ uid: worker });
    await db.doc(`jobs/${jobId}`).set({ title: 'T', postedBy: uid('alice'), status: 'open', applicants: [], assignedTo: [] });
    await expect(invite(uid('mallory'), { jobId, workerId: worker })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await notificationsFor(db, worker)).toHaveLength(0);
  });
});
