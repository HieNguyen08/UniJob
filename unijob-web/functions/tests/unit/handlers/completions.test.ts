import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleCompletionWritten } from '../../../src/handlers/completions.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({
  'jobs/j1': { title: 'Nhập liệu', postedBy: 'poster', assignedTo: ['w1'], status: 'in-progress' },
  'jobs/open': { title: 'Mở', postedBy: 'poster', assignedTo: [], status: 'open' },
  'jobs/done': { title: 'Xong', postedBy: 'poster', assignedTo: ['w1'], status: 'completed' },
});
const pending = { jobId: 'j1', workerConfirmed: false, posterConfirmed: false, status: 'pending' };

beforeEach(() => vi.clearAllMocks());

describe('handleCompletionWritten', () => {
  it('worker confirms first on jobCompletions/{jobId} -> completion_requested to the poster, keyed by job', async () => {
    await expect(handleCompletionWritten(db, 'j1', pending, { ...pending, workerConfirmed: true })).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'poster',
      type: 'completion_requested',
      message: '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu' },
      sourceId: 'j1',
    });
  });
  it('a completion created already confirmed by the worker also counts', async () => {
    await expect(handleCompletionWritten(db, 'j1', undefined, { ...pending, workerConfirmed: true })).resolves.toBe(true);
  });
  it('a server record overwriting a legacy doc whose worker flag was already true still notifies', async () => {
    const legacy = { ...pending, workerConfirmed: true };
    await expect(handleCompletionWritten(db, 'j1', legacy, { ...legacy, source: 'server', serverVersion: 'completion-v1' })).resolves.toBe(true);
    await expect(handleCompletionWritten(db, 'j1', legacy, { ...legacy, source: 'server' })).resolves.toBe(false); // no marker
    await expect(handleCompletionWritten(db, 'j1', { ...legacy, source: 'server', serverVersion: 'completion-v1' }, { ...legacy, source: 'server', serverVersion: 'completion-v1', updatedAt: 1 })).resolves.toBe(false);
  });
  it('no request when the poster already confirmed (the job_completed path handles it)', async () => {
    await expect(
      handleCompletionWritten(db, 'j1', { ...pending, posterConfirmed: true }, { ...pending, posterConfirmed: true, workerConfirmed: true }),
    ).resolves.toBe(false);
  });
  it('skips a completion doc whose id is not its jobId (one completion per job, id == jobId)', async () => {
    const confirmed = { ...pending, workerConfirmed: true };
    await expect(handleCompletionWritten(db, 'forged', pending, confirmed)).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'j1', pending, { ...confirmed, jobId: undefined })).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('skips an in-progress job without an assigned worker', async () => {
    const local = fakeDb({ 'jobs/j2': { title: 'T', postedBy: 'poster', assignedTo: [], status: 'in-progress' } });
    await expect(handleCompletionWritten(local, 'j2', undefined, { ...pending, jobId: 'j2', workerConfirmed: true })).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('ignores non-transitions, deletes, and jobs that are not in progress with a worker', async () => {
    const confirmed = { ...pending, workerConfirmed: true };
    await expect(handleCompletionWritten(db, 'j1', confirmed, { ...confirmed, note: 'x' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'j1', confirmed, undefined)).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'open', pending, { ...confirmed, jobId: 'open' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'done', pending, { ...confirmed, jobId: 'done' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'missing', pending, { ...confirmed, jobId: 'missing' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'j1', pending, { ...confirmed, workerConfirmed: 'yes' })).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
});
