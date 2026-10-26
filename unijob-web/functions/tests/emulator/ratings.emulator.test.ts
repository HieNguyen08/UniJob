import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleRatingCreated } from '../../src/handlers/ratings.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const seedUser = (id: string, fields: Record<string, unknown>) => db.doc(`users/${id}`).set(fields);
async function rate(to: string, score: unknown, from: string = uid('from')): Promise<[string, Record<string, unknown>]> {
  const jobId = uid('job');
  const id = `${jobId}_${from}_${to}`;
  const data = { jobId, toUserId: to, fromUserId: from, type: 'poster-to-worker', score, comment: '' };
  await db.doc(`ratings/${id}`).set(data);
  return [id, data];
}
const userOf = async (id: string) => (await db.doc(`users/${id}`).get()).data();

describe('handleRatingCreated (emulator)', () => {
  it('recomputes average, count and score (with penalties) from all ratings', async () => {
    const u = uid('u');
    await seedUser(u, { ratingScore: 0, totalRatings: 0, penaltyPoints: 5 });
    await rate(u, 5); await rate(u, 4);
    const [id, data] = await rate(u, 4);
    await expect(handleRatingCreated(db, id, data)).resolves.toBe('updated');
    expect(await userOf(u)).toMatchObject({ ratingAverage: 4.3, totalRatings: 3, ratingScore: 3.8, penaltyPoints: 5 });
  });
  it('redelivery gives the same result (recompute, not increment)', async () => {
    const u = uid('u');
    await seedUser(u, { ratingScore: 0, totalRatings: 0 });
    const [id, data] = await rate(u, 5);
    await handleRatingCreated(db, id, data);
    await handleRatingCreated(db, id, data);
    expect(await userOf(u)).toMatchObject({ ratingAverage: 5, totalRatings: 1, ratingScore: 5 });
  });
  it('concurrent triggers for two ratings of the same user end at totalRatings 2', async () => {
    const u = uid('u');
    await seedUser(u, { ratingScore: 0, totalRatings: 0 });
    const a = await rate(u, 5);
    const b = await rate(u, 2);
    await Promise.all([handleRatingCreated(db, ...a), handleRatingCreated(db, ...b)]);
    expect(await userOf(u)).toMatchObject({ totalRatings: 2, ratingAverage: 3.5 });
  });
  it('a missing profile gets a server stub with the aggregate', async () => {
    const u = uid('ghost');
    const [id, data] = await rate(u, 5);
    await expect(handleRatingCreated(db, id, data)).resolves.toBe('updated');
    expect(await userOf(u)).toEqual({
      uid: u, stub: true, ratingAverage: 5, totalRatings: 1, ratingScore: 5, penaltyPoints: 0, activeJobCount: 0, completedJobs: 0,
    });
  });
  it.each([['no toUserId', {}], ['toUserId with a slash', { toUserId: 'a/b' }], ['no data', undefined]])(
    '%s is skipped', async (_l, data) => {
      await expect(handleRatingCreated(db, 'r1', data)).resolves.toBe('skipped');
    });
  it('ignores a random-id legacy rating and a duplicate-looking forged one', async () => {
    const u = uid('u');
    await seedUser(u, { ratingScore: 0, totalRatings: 0 });
    await db.doc(`ratings/${uid('random')}`).set({ jobId: 'j', toUserId: u, fromUserId: uid('f'), type: 'poster-to-worker', score: 1 });
    const [id, data] = await rate(u, 4);
    await handleRatingCreated(db, id, data);
    expect(await userOf(u)).toMatchObject({ totalRatings: 1, ratingAverage: 4 });
  });
  it('an existing real profile never gets stub', async () => {
    const u = uid('u');
    await seedUser(u, { email: 'a@hcmut.edu.vn', ratingScore: 0, totalRatings: 0 });
    const [id, data] = await rate(u, 4);
    await handleRatingCreated(db, id, data);
    expect((await userOf(u))?.stub).toBeUndefined();
  });
  it('ignores invalid legacy ratings in the average', async () => {
    const u = uid('u');
    await seedUser(u, { ratingScore: 0, totalRatings: 0 });
    await rate(u, 0); await rate(u, 4, u); await rate(u, 4);
    const [id, data] = await rate(u, 5);
    await handleRatingCreated(db, id, data);
    expect(await userOf(u)).toMatchObject({ totalRatings: 2, ratingAverage: 4.5 });
  });
});
