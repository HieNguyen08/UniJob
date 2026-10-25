import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { expireOverdueJobs } from '../../src/handlers/expireJobs.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const NOW = Timestamp.fromMillis(Date.UTC(2026, 9, 17, 3, 0, 0)); // 10:00 on Oct 17 in Vietnam
const hoursFromNow = (h: number) => Timestamp.fromMillis(NOW.toMillis() + h * 3_600_000);

async function job(poster: string, over: Record<string, unknown>) {
  const id = uid('job');
  await db.doc(`jobs/${id}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'open', applicants: [], assignedTo: [], deadline: hoursFromNow(-1), ...over });
  return id;
}
const statusOf = async (id: string) => (await db.doc(`jobs/${id}`).get()).get('status');

describe('expireOverdueJobs on the emulator', () => {
  it('cancels only open jobs past their deadline and notifies each poster once, across pages and reruns', async () => {
    const poster = uid('poster');
    const overdue = await Promise.all([1, 2, 3, 4, 5].map((d) => job(poster, { deadline: hoursFromNow(-24 * d) })));
    const future = await job(poster, { deadline: hoursFromNow(5) });
    const inProgress = await job(poster, { status: 'in-progress' });
    const stringDeadline = await job(poster, { deadline: '2020-01-01' });

    const first = await expireOverdueJobs(db, NOW, { pageSize: 2 });
    expect(first.expired).toBeGreaterThanOrEqual(5);
    for (const id of overdue) {
      expect(await statusOf(id)).toBe('cancelled');
      expect((await db.doc(`jobs/${id}`).get()).get('cancelReason')).toBe('expired');
    }
    expect(await statusOf(future)).toBe('open');
    expect(await statusOf(inProgress)).toBe('in-progress');
    expect(await statusOf(stringDeadline)).toBe('open');

    await expireOverdueJobs(db, NOW, { pageSize: 2 }); // rerun: nothing new for this poster
    const docs = await notificationsFor(db, poster);
    expect(docs.map((d) => d.id).sort()).toEqual(overdue.map((id) => `deadline_expired_${id}`).sort());
    expect(docs[0].data()).toMatchObject({
      type: 'deadline_expired',
      message: '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.',
      source: 'server',
    });
  });

  it('stops after maxPages and leaves the rest for the next run', async () => {
    const poster = uid('poster');
    await Promise.all([1, 2, 3].map((h) => job(poster, { deadline: hoursFromNow(-1000 - h) })));
    const capped = await expireOverdueJobs(db, NOW, { pageSize: 1, maxPages: 1 });
    expect(capped.expired).toBe(1);
    expect(capped.more).toBe(true);
  });

  it('keeps a job open for the rest of its deadline day in Vietnam, and expires it the next day', async () => {
    const poster = uid('poster');
    const id = await job(poster, { deadline: hoursFromNow(-1) }); // 09:00 Oct 17 in Vietnam
    const sameDay = await expireOverdueJobs(db, NOW);
    expect(sameDay.notDue).toBe(0); // the query only returns jobs whose deadline day already ended
    expect(await statusOf(id)).toBe('open');
    expect(await notificationsFor(db, poster)).toHaveLength(0);

    await expireOverdueJobs(db, Timestamp.fromMillis(Date.UTC(2026, 9, 17, 17, 0, 0))); // 00:00 Oct 18 in Vietnam
    expect(await statusOf(id)).toBe('cancelled');
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`deadline_expired_${id}`]);
  });

  it('clears the deadline of a legacy "no deadline" job (no cancel, no notification) so it leaves the scan', async () => {
    const poster = uid('poster');
    const createdAt = hoursFromNow(-24 * 30);
    const id = await job(poster, { deadline: createdAt, createdAt });
    const run = await expireOverdueJobs(db, NOW);
    expect(run.legacyCleared).toBeGreaterThanOrEqual(1);
    const snap = await db.doc(`jobs/${id}`).get();
    expect(snap.get('status')).toBe('open');
    expect(snap.get('deadline')).toBeNull();
    expect(snap.get('cancelReason')).toBeUndefined();
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });

  it("expires (never nulls) a deadline the client stored as new Date('YYYY-MM-DD'), posted later that day", async () => {
    const poster = uid('poster');
    const deadline = Timestamp.fromDate(new Date('2026-10-10')); // 07:00 Oct 10 in Vietnam
    const id = await job(poster, { deadline, createdAt: Timestamp.fromDate(new Date('2026-10-10T05:00:00Z')) });
    await expireOverdueJobs(db, NOW);
    const snap = await db.doc(`jobs/${id}`).get();
    expect(snap.get('status')).toBe('cancelled');
    expect((snap.get('deadline') as Timestamp).toMillis()).toBe(deadline.toMillis());
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`deadline_expired_${id}`]);
  });

  it('legacy jobs do not starve the page budget: the next run reaches the overdue job behind them', async () => {
    const poster = uid('poster');
    const createdAt = hoursFromNow(-60_000); // older than anything else in the emulator db
    const legacy = await job(poster, { deadline: createdAt, createdAt });
    const overdue = await job(poster, { deadline: hoursFromNow(-59_000) });
    const first = await expireOverdueJobs(db, NOW, { pageSize: 1, maxPages: 1 });
    expect(first).toMatchObject({ legacyCleared: 1, expired: 0 });
    const second = await expireOverdueJobs(db, NOW, { pageSize: 1, maxPages: 1 });
    expect(second).toMatchObject({ legacyCleared: 0, expired: 1 });
    expect(await statusOf(overdue)).toBe('cancelled');
    expect(await statusOf(legacy)).toBe('open');
  });

  it('skips a job its poster edited after the query (precondition) and sends no notification', async () => {
    const poster = uid('poster');
    const id = await job(poster, { deadline: hoursFromNow(-2000) });
    const racing = await expireOverdueJobs(db, NOW, {
      pageSize: 50,
      beforeWrite: async () => {
        await db.doc(`jobs/${id}`).update({ deadline: hoursFromNow(48) });
      },
    });
    expect(racing.skipped).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe('open');
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });
});
