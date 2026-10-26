import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleJobCounters } from '../../src/handlers/counters.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const userOf = async (id: string) => (await db.doc(`users/${id}`).get()).data();

async function jobFor(worker: string, status: string, opts: { profile?: boolean; activeJobCount?: number } = {}) {
  if (opts.profile !== false) await db.doc(`users/${worker}`).set({ activeJobCount: opts.activeJobCount ?? 0 });
  const jobId = uid('job');
  const poster = uid('poster');
  const base = { title: 'Nhập liệu', postedBy: poster };
  const open = { ...base, status: 'open', assignedTo: [] };
  const inProgress = { ...base, status: 'in-progress', assignedTo: [worker] };
  const completed = { ...base, status: 'completed', assignedTo: [worker] };
  const cancelled = { ...base, status: 'cancelled', assignedTo: [worker] };
  const states = { open, 'in-progress': inProgress, completed, cancelled } as Record<string, Record<string, unknown>>;
  const jobRef = db.doc(`jobs/${jobId}`);
  await jobRef.set(states[status]);
  /** Updates the job to `to` and feeds the (from, to) event to the handler. */
  const move = async (from: string, to: string) => {
    await jobRef.set(states[to]);
    return handleJobCounters(db, jobId, states[from], states[to]);
  };
  return { jobId, jobRef, move, markerRef: db.doc(`jobCounters/${jobId}`), states };
}

describe('handleJobCounters (emulator)', () => {
  it('open -> in-progress: activeJobCount 1, marker written; redelivered twice concurrently: still 1', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'open');
    await expect(j.move('open', 'in-progress')).resolves.toBe('updated');
    expect((await userOf(w))?.activeJobCount).toBe(1);
    expect((await j.markerRef.get()).data()).toMatchObject({ activeWorker: w, completedWorker: null });
    await Promise.all([
      handleJobCounters(db, j.jobId, j.states.open, j.states['in-progress']),
      handleJobCounters(db, j.jobId, j.states.open, j.states['in-progress']),
    ]);
    expect((await userOf(w))?.activeJobCount).toBe(1);
  });
  it('-> completed: activeJobCount 0, completedJobs 1; redelivered: unchanged', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'open');
    await j.move('open', 'in-progress');
    await expect(j.move('in-progress', 'completed')).resolves.toBe('updated');
    expect(await userOf(w)).toMatchObject({ activeJobCount: 0, completedJobs: 1 });
    await expect(j.move('in-progress', 'completed')).resolves.toBe('unchanged');
    expect((await userOf(w))?.completedJobs).toBe(1);
  });
  it('in-progress -> open (worker cancel): back to 0; a profile already at 0 stays 0 (never negative)', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'open');
    await j.move('open', 'in-progress');
    await j.move('in-progress', 'open');
    expect((await userOf(w))?.activeJobCount).toBe(0);
    await db.doc(`users/${w}`).update({ activeJobCount: 0 });
    await j.markerRef.set({ activeWorker: w, completedWorker: null });
    await j.move('in-progress', 'open');
    expect((await userOf(w))?.activeJobCount).toBe(0);
  });
  it('in-progress -> cancelled: activeJobCount -1', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'open');
    await j.move('open', 'in-progress');
    expect((await userOf(w))?.activeJobCount).toBe(1);
    await j.move('in-progress', 'cancelled');
    expect((await userOf(w))?.activeJobCount).toBe(0);
  });
  it('an old open -> in-progress event delivered after the job was cancelled changes nothing', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'cancelled');
    await expect(handleJobCounters(db, j.jobId, j.states.open, j.states['in-progress'])).resolves.toBe('unchanged');
    expect((await userOf(w))?.activeJobCount).toBe(0);
  });
  it('two jobs assigned to the same worker at once: activeJobCount 2', async () => {
    const w = uid('w');
    const a = await jobFor(w, 'open');
    const b = await jobFor(w, 'open');
    await Promise.all([a.move('open', 'in-progress'), b.move('open', 'in-progress')]);
    expect((await userOf(w))?.activeJobCount).toBe(2);
  });
  it('a missing worker profile gets a server stub with the counters', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'open', { profile: false });
    await expect(j.move('open', 'in-progress')).resolves.toBe('updated');
    expect(await userOf(w)).toEqual({
      uid: w, stub: true, activeJobCount: 1, completedJobs: 0, ratingAverage: 0, totalRatings: 0, ratingScore: 0, penaltyPoints: 0,
    });
    expect((await j.markerRef.get()).exists).toBe(true);
  });
  it('an irrelevant update (title only) is skipped and writes no marker', async () => {
    const w = uid('w');
    const j = await jobFor(w, 'in-progress');
    const after = { ...j.states['in-progress'], title: 'Khác' };
    await expect(handleJobCounters(db, j.jobId, j.states['in-progress'], after)).resolves.toBe('skipped');
    expect((await j.markerRef.get()).exists).toBe(false);
  });
});
