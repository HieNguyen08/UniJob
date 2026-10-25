import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleJobUpdated } from '../../../src/handlers/jobs.js';
import { writeNotification } from '../../../src/lib/notifications.js';

const db = {} as Firestore; // the handler must not read: before/after carry everything
const job = { title: 'Nhập liệu', postedBy: 'poster', assignedTo: ['w1'], status: 'in-progress' };
const sent = () => vi.mocked(writeNotification).mock.calls.map((c) => c[1]);

beforeEach(() => vi.clearAllMocks());

describe('handleJobUpdated: cancelled', () => {
  it('notifies every assigned worker (before or after the write) with job_cancelled keyed by job and worker', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'cancelled', assignedTo: ['w2'] })).resolves.toBe(2);
    expect(sent()).toEqual([
      { userId: 'w1', type: 'job_cancelled', message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w1' },
      { userId: 'w2', type: 'job_cancelled', message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w2' },
    ]);
  });
  it('sends nothing for an open job without workers (deadline expiry, poster cancel before assigning)', async () => {
    const open = { ...job, status: 'open', assignedTo: [] };
    await expect(handleJobUpdated(db, 'j1', open, { ...open, status: 'cancelled' })).resolves.toBe(0);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('tells workers assigned to an expired open job with neutral expiry wording, not "đã bị người đăng hủy"', async () => {
    const open = { ...job, status: 'open' };
    await expect(handleJobUpdated(db, 'j1', open, { ...open, status: 'cancelled', cancelReason: 'expired' })).resolves.toBe(1);
    expect(sent()).toEqual([
      {
        userId: 'w1',
        type: 'job_cancelled',
        message: '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.',
        extras: { jobId: 'j1', jobTitle: 'Nhập liệu' },
        sourceId: 'j1_w1',
      },
    ]);
  });
  it('sends nothing for an expired open job without assigned workers (the poster gets deadline_expired)', async () => {
    const open = { ...job, status: 'open', assignedTo: [] };
    await expect(handleJobUpdated(db, 'j1', open, { ...open, status: 'cancelled', cancelReason: 'expired' })).resolves.toBe(0);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('still notifies workers when a client sets cancelReason expired on a job that was not open', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'cancelled', cancelReason: 'expired' })).resolves.toBe(1);
    expect(sent()[0]).toMatchObject({ userId: 'w1', type: 'job_cancelled' });
  });
  it('never notifies the poster as a worker, and ignores junk assignees', async () => {
    await handleJobUpdated(db, 'j1', { ...job, assignedTo: ['poster', 7, ''] }, { ...job, status: 'cancelled', assignedTo: ['poster'] });
    expect(writeNotification).not.toHaveBeenCalled();
  });
});

describe('handleJobUpdated: completed', () => {
  it('notifies the worker and the poster with their own texts and ids', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'completed' })).resolves.toBe(2);
    expect(sent()).toEqual([
      { userId: 'w1', type: 'job_completed', message: '🎉 Công việc "Nhập liệu" đã hoàn thành! Hãy để lại đánh giá.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w1' },
      { userId: 'poster', type: 'job_completed', message: '✅ Công việc "Nhập liệu" đã được xác nhận hoàn thành.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_poster' },
    ]);
  });
  it('sends nothing without an assigned worker (same as the old client)', async () => {
    await expect(handleJobUpdated(db, 'j1', { ...job, assignedTo: [] }, { ...job, assignedTo: [], status: 'completed' })).resolves.toBe(0);
  });
});

describe('handleJobUpdated: everything else', () => {
  it('ignores updates that keep the status (e.g. applicants arrayUnion) and other transitions', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, applicants: ['x'] })).resolves.toBe(0);
    await expect(handleJobUpdated(db, 'j1', { ...job, status: 'open' }, job)).resolves.toBe(0);
    await expect(handleJobUpdated(db, 'j1', undefined, job)).resolves.toBe(0);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('counts only newly written notifications (redelivery returns 0)', async () => {
    vi.mocked(writeNotification).mockResolvedValue(false);
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'completed' })).resolves.toBe(0);
  });
});
