import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeAll, describe, expect, it } from 'vitest';
import { DISPUTE_MSG, handleDisputePayment } from '../../src/handlers/disputes.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
let disputePayment: typeof import('../../src/callables/disputePayment.js').disputePayment;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
  // after the guards: the callable binds to the same emulator-backed Admin db
  ({ disputePayment } = await import('../../src/callables/disputePayment.js'));
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const reason = 'Người làm chưa giao bài đúng hạn';

/** In-progress job with a server-held payment (shape written by handleEscrowOnAccept). */
async function heldJob(payment: Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker], payment: 150_000, paymentType: 'fixed', paymentStatus: 'held' });
  await db.doc(`payments/${jobId}_${worker}`).set({
    jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500, netAmount: 145_500,
    status: 'held', method: 'platform_escrow', note: '', source: 'server', createdAt: Timestamp.now(), heldAt: Timestamp.now(), releasedAt: null,
    ...payment,
  });
  return { poster, worker, jobId, payRef: db.doc(`payments/${jobId}_${worker}`) };
}

const verifiedRequest = (id: string, data: unknown, token: Record<string, unknown> = {}) =>
  ({
    data,
    auth: { uid: id, rawToken: '', token: { email: `${id}@hcmut.edu.vn`, email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...token } },
    rawRequest: {},
    acceptsStreaming: false,
  }) as unknown as CallableRequest<unknown>;

describe('disputePayment on the emulator', () => {
  it('the poster disputes: payment and job become disputed, the worker gets one payment_disputed without the reason', async () => {
    const { poster, worker, jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(poster, { jobId, reason: `  ${reason} www.evil.com ` }))).resolves.toEqual({ disputed: true });
    const pay = (await payRef.get()).data();
    expect(pay).toMatchObject({ status: 'disputed', disputedBy: poster, disputeReason: `${reason} [liên kết]` });
    expect(pay?.disputedAt).toBeInstanceOf(Timestamp);
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBe('disputed');
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`payment_disputed_${jobId}`]);
    expect(docs[0].data()).toMatchObject({
      type: 'payment_disputed', source: 'server', jobId,
      message: '⚠️ Thanh toán ký quỹ cho "Nhập liệu" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.',
    });
    expect(docs[0].get('message')).not.toContain(reason);
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });

  it('the worker disputes: the poster is notified; a second dispute is failed-precondition', async () => {
    const { poster, worker, jobId } = await heldJob();
    await expect(handleDisputePayment(db, worker, { jobId, reason })).resolves.toEqual({ disputed: true });
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`payment_disputed_${jobId}`]);
    await expect(handleDisputePayment(db, poster, { jobId, reason })).rejects.toMatchObject({ code: 'failed-precondition', message: DISPUTE_MSG.notHeld });
  });

  it('an outsider gets permission-denied and nothing changes', async () => {
    const { jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(uid('mallory'), { jobId, reason }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it('a second assignee who is not the payee gets permission-denied and nothing changes', async () => {
    const { jobId, worker, payRef } = await heldJob();
    const other = uid('worker2');
    await db.doc(`jobs/${jobId}`).update({ assignedTo: [worker, other] });
    await expect(handleDisputePayment(db, other, { jobId, reason })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it.each([
    ['unverified email', { email_verified: false }],
    ['non-HCMUT email', { email: 'poster@gmail.com' }],
    ['anonymous user', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s: the poster is refused with permission-denied and nothing changes', async (_l, token) => {
    const { poster, jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(poster, { jobId, reason }, token))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it.each(['released', 'refunded'])('a %s payment cannot be disputed', async (status) => {
    const { poster, jobId } = await heldJob({ status });
    await expect(handleDisputePayment(db, poster, { jobId, reason })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('a forged non-server payment or no payment at all is not-found', async () => {
    const forged = await heldJob({ source: 'client' });
    await expect(handleDisputePayment(db, forged.poster, { jobId: forged.jobId, reason })).rejects.toMatchObject({ code: 'not-found', message: DISPUTE_MSG.noPayment });
    const none = await heldJob();
    await none.payRef.delete();
    await expect(handleDisputePayment(db, none.poster, { jobId: none.jobId, reason })).rejects.toMatchObject({ code: 'not-found', message: DISPUTE_MSG.noPayment });
  });

  it.each([
    ['payeeId', { payeeId: 'someone-else' }],
    ['payerId', { payerId: 'mallory' }],
    ['jobId', { jobId: 'other-job' }],
  ])('a source:server doc with a different %s is not-found and stays held', async (_l, forged) => {
    const { poster, payRef, jobId } = await heldJob(forged);
    await expect(handleDisputePayment(db, poster, { jobId, reason })).rejects.toMatchObject({ code: 'not-found', message: DISPUTE_MSG.noPayment });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it('a bad reason is invalid-argument and a missing job is not-found', async () => {
    const { poster, jobId, payRef } = await heldJob();
    await expect(handleDisputePayment(db, poster, { jobId, reason: 'ngắn' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await payRef.get()).get('status')).toBe('held');
    await expect(handleDisputePayment(db, poster, { jobId: uid('nojob'), reason })).rejects.toMatchObject({ code: 'not-found' });
  });
});
