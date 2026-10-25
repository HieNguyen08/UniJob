import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/expireJobs.js', () => ({
  expireOverdueJobs: vi.fn(async () => ({ expired: 2, notified: 2, skipped: 0, notDue: 0, legacyCleared: 1, more: false })),
}));

import { expireOverdueJobs } from '../../../src/handlers/expireJobs.js';
import { expireJobs } from '../../../src/scheduled/expireJobs.js';

describe('expireJobs', () => {
  it('runs every 30 minutes in Asia/Ho_Chi_Minh, in asia-southeast1', () => {
    expect(expireJobs.__endpoint.region).toEqual(['asia-southeast1']);
    expect(expireJobs.__endpoint.scheduleTrigger).toMatchObject({ schedule: 'every 30 minutes', timeZone: 'Asia/Ho_Chi_Minh' });
  });
  it('has a 540 s timeout and a page budget that fits it (200 x 10)', async () => {
    expect(expireJobs.__endpoint.timeoutSeconds).toBe(540);
    await expireJobs.run({ scheduleTime: new Date().toISOString(), jobName: 'test' } as never);
    expect(vi.mocked(expireOverdueJobs).mock.calls.at(-1)?.[2]).toEqual({ pageSize: 200, maxPages: 10 });
  });
  it('calls the handler with the Admin db and the current time', async () => {
    const before = Date.now();
    await expireJobs.run({ scheduleTime: new Date().toISOString(), jobName: 'test' } as never);
    const [db, now] = vi.mocked(expireOverdueJobs).mock.calls[0];
    expect(db).toEqual({ fake: 'db' });
    expect(now).toBeInstanceOf(Timestamp);
    expect((now as Timestamp).toMillis()).toBeGreaterThanOrEqual(before);
  });
});
