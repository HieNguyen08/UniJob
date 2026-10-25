import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleSendJobInvite, INVITE_MSG } from '../../../src/handlers/invites.js';
import { MSG_JOB_NOT_FOUND } from '../../../src/lib/auth.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({
  'jobs/j1': { title: 'Nhập liệu', postedBy: 'alice', postedByName: 'Alice', isAnonymous: false, status: 'open' },
  'jobs/spoof': { title: 'Học bổng', postedBy: 'alice', postedByName: 'Phòng Đào tạo HCMUT', isAnonymous: false, status: 'open' },
  'jobs/anon': { title: 'Bí mật', postedBy: 'alice', postedByName: 'Ẩn danh', isAnonymous: true, status: 'open' },
  'jobs/anonSpoof': { title: 'Bí mật', postedBy: 'alice', postedByName: 'Phòng Đào tạo HCMUT', isAnonymous: true, status: 'open' },
  'jobs/legacyAnon': { title: 'Cũ', postedBy: 'alice', postedByName: 'Ẩn danh', status: 'open' },
  'jobs/carolJob': { title: 'T', postedBy: 'carol', postedByName: 'Carol', isAnonymous: false, status: 'open' },
  'jobs/daveJob': { title: 'T', postedBy: 'dave', postedByName: 'Dave', isAnonymous: false, status: 'open' },
  'jobs/eveJob': { title: 'T', postedBy: 'eve', postedByName: 'Eve', isAnonymous: false, status: 'open' },
  'jobs/busy': { title: 'T', postedBy: 'alice', postedByName: 'Alice', status: 'in-progress' },
  // users/{uid}.displayName is user-editable: the sender name must come from Firebase Auth instead.
  'users/alice': { displayName: 'Phòng Đào tạo HCMUT' },
  'users/bob': { displayName: 'Bob' },
  'users/carol': { displayName: 'Carol' },
});

/** Firebase Auth names (makeAuthNameOf already trims and maps unusable names to ''). */
const authNames: Record<string, string> = { alice: 'Alice', bob: 'Bob' };
const authNameOf = vi.fn(async (uid: string) => authNames[uid] ?? '');
const invite = (uid: string, data: unknown) => handleSendJobInvite(db, uid, data, authNameOf);

const sentFromName = (i = 0) => vi.mocked(writeNotification).mock.calls[i][1].extras?.fromName;

beforeEach(() => vi.clearAllMocks());

describe('handleSendJobInvite', () => {
  it('notifies the worker with job_invite keyed by job and worker', async () => {
    await expect(invite('alice', { jobId: 'j1', workerId: 'bob' })).resolves.toEqual({ sent: true });
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'bob',
      type: 'job_invite',
      message: 'Alice mời bạn ứng tuyển "Nhập liệu"',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu', fromName: 'Alice' },
      sourceId: 'j1_bob',
    });
  });
  it("ignores a spoofed job.postedByName and users/{uid}.displayName and signs with the caller's Auth name", async () => {
    await invite('alice', { jobId: 'spoof', workerId: 'bob' });
    expect(sentFromName()).toBe('Alice');
    expect(vi.mocked(writeNotification).mock.calls[0][1].message).toBe('Alice mời bạn ứng tuyển "Học bổng"');
  });
  it.each(['anon', 'anonSpoof', 'legacyAnon'])('signs anonymous job %s as "Ẩn danh"', async (jobId) => {
    await invite('alice', { jobId, workerId: 'bob' });
    expect(sentFromName()).toBe('Ẩn danh');
    expect(vi.mocked(writeNotification).mock.calls[0][1].message).toMatch(/^Ẩn danh mời bạn ứng tuyển "/);
  });
  it('never looks up the Auth name for an anonymous job', async () => {
    await invite('alice', { jobId: 'anon', workerId: 'bob' });
    expect(authNameOf).not.toHaveBeenCalled();
  });
  it.each([
    ['carol', 'carolJob'],
    ['dave', 'daveJob'],
    ['eve', 'eveJob'],
  ])('falls back to "Người đăng việc" when %s has no Auth name', async (uid, jobId) => {
    await invite(uid, { jobId, workerId: 'bob' });
    expect(sentFromName()).toBe('Người đăng việc');
  });
  it('returns sent: false for a repeat invite', async () => {
    vi.mocked(writeNotification).mockResolvedValueOnce(false);
    await expect(invite('alice', { jobId: 'j1', workerId: 'bob' })).resolves.toEqual({ sent: false });
  });
  it.each([
    [null, 'invalid-argument', INVITE_MSG.invalid],
    ['x', 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'j1' }, 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'a/b', workerId: 'bob' }, 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'j1', workerId: 'alice' }, 'invalid-argument', INVITE_MSG.self],
    [{ jobId: 'missing', workerId: 'bob' }, 'not-found', MSG_JOB_NOT_FOUND],
    [{ jobId: 'busy', workerId: 'bob' }, 'failed-precondition', INVITE_MSG.notOpen],
    [{ jobId: 'j1', workerId: 'ghost' }, 'not-found', INVITE_MSG.workerNotFound],
  ])('rejects %j with %s', async (data, code, message) => {
    await expect(invite('alice', data)).rejects.toMatchObject({ code, message });
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('only the poster may invite', async () => {
    await expect(invite('mallory', { jobId: 'j1', workerId: 'bob' })).rejects.toMatchObject({
      code: 'permission-denied',
      message: INVITE_MSG.notPoster,
    });
  });
});
