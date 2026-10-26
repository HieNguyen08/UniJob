import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Danh sách này phải khớp storage.service.ts (không import vì file đó khởi tạo client SDK).
const ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MB = 1024 * 1024;

let env: RulesTestEnvironment;
let adminApp: App;
let named: Firestore;
let fallbackDb: Firestore;

const st = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
// Mỗi test dùng tên file riêng: env.clearStorage() không xoá hết object giữa các test trên emulator.
let seq = 0;
const att = (jobId: string, name = `1761400000000_cv${seq}.pdf`) => `jobs/${jobId}/attachments/${name}`;
const put = (
  uid: string | undefined,
  path: string,
  size = 16,
  contentType?: string,
  extra: Record<string, string> = {},
) =>
  st(uid)
    .ref(path)
    .put(new Uint8Array(size), contentType ? { contentType, ...extra } : undefined)
    .then(() => undefined);
const seedFile = (path: string) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(path).put(new Uint8Array(16), { contentType: 'application/pdf' });
  });

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('run under firebase emulators:exec --only firestore,storage');
  }
  env = await initializeTestEnvironment({
    projectId: 'demo-unijob',
    storage: { rules: readFileSync(join(process.cwd(), 'storage.rules'), 'utf8') },
  });
  adminApp = initializeApp({ projectId: 'demo-unijob' }, 'storage-rules-seed');
  named = getFirestore(adminApp, 'kirigitejkf8095h');
  fallbackDb = getFirestore(adminApp);
});

afterAll(async () => {
  await env?.cleanup();
  await named?.recursiveDelete(named.collection('jobs'));
  await fallbackDb?.recursiveDelete(fallbackDb.collection('jobs'));
  if (adminApp) await deleteApp(adminApp);
});

beforeEach(async () => {
  await env.clearStorage();
  seq += 1;
  const job = (postedBy: string, status: string) => ({ postedBy, status });
  await named.collection('jobs').doc('open1').set(job('poster', 'open'));
  await named.collection('jobs').doc('busy').set(job('poster', 'in-progress'));
  await named.collection('jobs').doc('gone').set(job('poster', 'cancelled'));
  await named.collection('jobs').doc('done').set(job('poster', 'completed'));
  await named.collection('jobs').doc('split').set(job('poster', 'open'));
  await fallbackDb.collection('jobs').doc('split').set(job('mallory', 'open'));
  await fallbackDb.collection('jobs').doc('defaultOnly').set(job('mallory', 'open'));
});

describe('storage rules: job attachments', () => {
  it('the poster uploads a PDF to their own open job', async () => {
    await assertSucceeds(put('poster', att('open1'), 16, 'application/pdf'));
  });
  it('reads the job from the named database kirigitejkf8095h, not (default)', async () => {
    await assertSucceeds(put('poster', att('split'), 16, 'application/pdf'));
    await assertFails(put('mallory', att('split', '1761400000000_b.pdf'), 16, 'application/pdf'));
    await assertFails(put('mallory', att('defaultOnly'), 16, 'application/pdf'));
  });

  it('the poster uploads every allowed content type', async () => {
    for (const [i, type] of ALLOWED.entries()) {
      await assertSucceeds(put('poster', att('open1', `1761400000000_f${i}.pdf`), 16, type));
    }
  });
  it('non-posters and signed-out users cannot upload', async () => {
    await assertFails(put('mallory', att('open1'), 16, 'application/pdf'));
    await assertFails(put(undefined, att('open1'), 16, 'application/pdf'));
    await assertSucceeds(put('poster', att('open1'), 16, 'application/pdf')); // sanity
  });
  it('size: exactly 10 MB passes, one byte more is denied', async () => {
    await assertSucceeds(put('poster', att('open1', '1761400000000_max.pdf'), 10 * MB, 'application/pdf'));
    await assertFails(put('poster', att('open1', '1761400000000_big.pdf'), 10 * MB + 1, 'application/pdf'));
  });
  it('content types outside the client allowlist are denied', async () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', 'application/x-msdownload']) {
      await assertFails(put('poster', att('open1', `1761400000000_x${type.length}.pdf`), 16, type));
    }
    await assertFails(put('poster', att('open1', '1761400000000_none.pdf'), 16));
  });
  it('uploads need the job to be open and to exist', async () => {
    for (const jobId of ['busy', 'gone', 'done', 'missing']) {
      await assertFails(put('poster', att(jobId), 16, 'application/pdf'));
    }
  });
  it('file names up to 200 characters pass (including the longest Vietnamese name the client allows)', async () => {
    await assertSucceeds(put('poster', att('open1', `1761400000000_${'a'.repeat(182)}.pdf`), 16, 'application/pdf'));
    await assertFails(put('poster', att('open1', `1761400000000_${'a'.repeat(183)}.pdf`), 16, 'application/pdf'));
    await assertSucceeds(put('poster', att('open1', `1761400000000_${'ệ'.repeat(100)}.pdf`), 16, 'application/pdf'));
  });
  it('file names must be {13 digits}_{name} with an allowed extension (any case)', async () => {
    await assertSucceeds(put('poster', att('open1', '1761400000000_CV.PDF'), 16, 'application/pdf'));
    await assertSucceeds(put('poster', att('open1', '1761400000000_a.b.Docx'), 16, 'application/pdf'));
    for (const name of ['1761400000000_x.exe', '1761400000000_x.svg', '1761400000000_x.html', '1761400000000_x', '1761400000000_.pdf', 'x.pdf', '123_x.pdf', '1761400000000x.pdf']) {
      await assertFails(put('poster', att('open1', name), 16, 'application/pdf'));
    }
  });
  it('uploads cannot set contentDisposition (attachment/other) or contentEncoding', async () => {
    const n = (k: string) => att('open1', `1761400000000_${k}.pdf`);
    await assertFails(put('poster', n('cd'), 16, 'application/pdf', { contentDisposition: 'attachment; filename=x.html' }));
    await assertFails(put('poster', n('ce'), 16, 'application/pdf', { contentEncoding: 'gzip' }));
    await assertSucceeds(put('poster', n('ok'), 16, 'application/pdf'));
  });
  it('nested paths under attachments and other paths are denied', async () => {
    for (const p of ['jobs/open1/attachments/a/b.pdf', 'jobs/open1/x.pdf', 'jobs/open1/other/x.pdf', 'users/poster/a.pdf', 'a.pdf']) {
      await assertFails(put('poster', p, 16, 'application/pdf'));
      await assertFails(st('poster').ref(p).getMetadata());
    }
  });
  it('nobody overwrites an attachment or changes its metadata', async () => {
    await seedFile(att('open1'));
    await assertFails(put('poster', att('open1'), 16, 'application/pdf'));
    await assertFails(st('poster').ref(att('open1')).updateMetadata({ contentType: 'text/html' }));
  });
  it('signed-in users get attachments and their download URL; signed-out cannot; nobody lists', async () => {
    await seedFile(att('busy'));
    await assertSucceeds(st('mallory').ref(att('busy')).getDownloadURL());
    await assertSucceeds(st('mallory').ref(att('busy')).getMetadata());
    await assertFails(st(undefined).ref(att('busy')).getDownloadURL());
    await assertFails(st('poster').ref('jobs/busy/attachments').listAll());
  });
  it('only the poster deletes an attachment', async () => {
    await seedFile(att('busy'));
    await assertFails(st('mallory').ref(att('busy')).delete());
    await assertFails(st(undefined).ref(att('busy')).delete());
    await assertSucceeds(st('poster').ref(att('busy')).delete());
  });
});
