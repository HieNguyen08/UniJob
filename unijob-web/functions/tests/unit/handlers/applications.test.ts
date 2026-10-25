import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleApplicationCreated, handleApplicationUpdated } from '../../../src/handlers/applications.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({ 'jobs/j1': { title: 'Nhập liệu', postedBy: 'poster', status: 'open' } });
const app = { jobId: 'j1', applicantId: 'carol', applicantName: 'Carol', status: 'pending' };
const authNames: Record<string, string> = { carol: 'Carol', poster: 'Poster' };
const authNameOf = vi.fn(async (uid: string) => authNames[uid] ?? '');

beforeEach(() => vi.clearAllMocks());

describe('handleApplicationCreated', () => {
  it('notifies the poster with new_application keyed by the application id', async () => {
    await expect(handleApplicationCreated(db, 'j1_carol', app, authNameOf)).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'poster',
      type: 'new_application',
      message: 'Carol đã ứng tuyển "Nhập liệu"',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu', fromName: 'Carol' },
      sourceId: 'j1_carol',
    });
  });
  it('signs with the Firebase Auth name of the applicant, never the client-written applicantName', async () => {
    await handleApplicationCreated(db, 'j1_carol', { ...app, applicantName: 'Phòng Đào tạo HCMUT' }, authNameOf);
    expect(authNameOf).toHaveBeenCalledWith('carol');
    expect(vi.mocked(writeNotification).mock.calls[0][1]).toMatchObject({
      message: 'Carol đã ứng tuyển "Nhập liệu"',
      extras: { fromName: 'Carol' },
    });
  });
  it('uses "Một ứng viên" when the applicant has no Auth name', async () => {
    await handleApplicationCreated(db, 'j1_dan', { ...app, applicantId: 'dan', applicantName: 'Dan' }, authNameOf);
    expect(vi.mocked(writeNotification).mock.calls[0][1]).toMatchObject({
      message: 'Một ứng viên đã ứng tuyển "Nhập liệu"',
      extras: { fromName: 'Một ứng viên' },
    });
  });
  it('does nothing when the applicant is the poster, the job is missing, or the data is malformed', async () => {
    await expect(handleApplicationCreated(db, 'j1_poster', { ...app, applicantId: 'poster' }, authNameOf)).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'x_carol', { ...app, jobId: 'missing' }, authNameOf)).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'x_carol', { ...app, jobId: 'a/b' }, authNameOf)).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'j1_carol', { ...app, applicantId: 42 }, authNameOf)).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'j1_carol', undefined, authNameOf)).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
    expect(authNameOf).not.toHaveBeenCalled();
  });
});

describe('handleApplicationUpdated', () => {
  it.each([
    ['accepted', 'application_accepted', '🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!'],
    ['rejected', 'application_rejected', 'Đơn ứng tuyển "Nhập liệu" không được chấp nhận'],
  ] as const)('pending -> %s notifies the applicant', async (status, type, message) => {
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status })).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'carol',
      type,
      message,
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu' },
      sourceId: 'j1_carol',
    });
  });
  it('falls back to "công việc" when the job is gone (same as the old client)', async () => {
    await handleApplicationUpdated(db, 'x_carol', { ...app, jobId: 'gone' }, { ...app, jobId: 'gone', status: 'rejected' });
    expect(vi.mocked(writeNotification).mock.calls[0][1]).toMatchObject({
      message: 'Đơn ứng tuyển "công việc" không được chấp nhận',
      extras: { jobId: 'gone', jobTitle: 'công việc' },
    });
  });
  it('ignores updates that are not a pending decision', async () => {
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, message: 'edited' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', { ...app, status: 'accepted' }, { ...app, status: 'rejected' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status: 'weird' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status: 'accepted', applicantId: '' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', undefined, app)).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
});
