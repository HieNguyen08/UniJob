import { describe, expect, it } from 'vitest';
import { escrowAmount, isServerPayment, MAX_ESCROW_AMOUNT, paymentIdFor, paymentAmountsSane, paymentMatchesHeld, paymentMatchesJob } from '../../src/lib/payments.js';

describe('paymentIdFor', () => {
  it('is `${jobId}_${payeeId}`', () => expect(paymentIdFor('j1', 'w1')).toBe('j1_w1'));
});

describe('escrowAmount', () => {
  it.each([
    [{ payment: 150_000, paymentType: 'fixed' }, 150_000],
    [{ payment: 1, paymentType: 'hourly' }, 1],
    [{ payment: 50_000, paymentType: 'negotiable' }, 50_000],
    [{ payment: 50_000 }, 50_000], // legacy job without paymentType
    [{ payment: MAX_ESCROW_AMOUNT, paymentType: 'fixed' }, 100_000_000],
  ])('accepts %o', (job, amount) => {
    expect(escrowAmount(job)).toEqual({ ok: true, amount });
  });

  it('skips volunteer jobs even with a positive amount', () => {
    expect(escrowAmount({ payment: 50_000, paymentType: 'volunteer' })).toEqual({ ok: false, reason: 'volunteer' });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '150000', null, undefined])('rejects amount %s', (payment) => {
    expect(escrowAmount({ payment, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'invalid_amount' });
  });

  it('rejects amounts above 100 000 000 as over_cap, unsafe integers as invalid_amount', () => {
    expect(escrowAmount({ payment: 100_000_001, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'over_cap' });
    expect(escrowAmount({ payment: Number.MAX_SAFE_INTEGER, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'over_cap' });
    expect(escrowAmount({ payment: Number.MAX_SAFE_INTEGER + 2, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'invalid_amount' });
  });
});

describe('isServerPayment', () => {
  it('is true only for source: "server"', () => {
    expect(isServerPayment({ source: 'server' })).toBe(true);
    expect(isServerPayment({ source: 'client' })).toBe(false);
    expect(isServerPayment({})).toBe(false);
    expect(isServerPayment(undefined)).toBe(false);
  });
});

describe('paymentAmountsSane', () => {
  const ok = { amount: 150_000, platformFee: 4_500, netAmount: 145_500 };
  it('accepts consistent integer amounts within 1..MAX_ESCROW_AMOUNT', () => {
    expect(paymentAmountsSane(ok)).toBe(true);
    expect(paymentAmountsSane({ amount: MAX_ESCROW_AMOUNT, platformFee: 0, netAmount: MAX_ESCROW_AMOUNT })).toBe(true);
  });
  it.each([
    ['zero amount', { amount: 0, platformFee: 0, netAmount: 0 }],
    ['over cap', { amount: MAX_ESCROW_AMOUNT + 1, platformFee: 0, netAmount: MAX_ESCROW_AMOUNT + 1 }],
    ['fractional', { amount: 1.5, platformFee: 0, netAmount: 1.5 }],
    ['string amount', { ...ok, amount: '150000' }],
    ['net mismatch', { ...ok, netAmount: 999 }],
    ['fee missing', { amount: 150_000, netAmount: 150_000 }],
  ])('rejects %s', (_l, pay) => {
    expect(paymentAmountsSane(pay)).toBe(false);
  });
  it('rejects a missing payment', () => expect(paymentAmountsSane(undefined)).toBe(false));
});

describe('paymentMatchesHeld / paymentMatchesJob', () => {
  const fields = { jobId: 'j1', payerId: 'p1', payeeId: 'w1', amount: 150_000 };
  const pay = { ...fields, source: 'server' };
  const job = { postedBy: 'p1', assignedTo: ['w1'], payment: 150_000, paymentType: 'fixed' };

  it('paymentMatchesHeld needs a server doc with identical ids (the amount may differ)', () => {
    expect(paymentMatchesHeld(pay, fields)).toBe(true);
    expect(paymentMatchesHeld({ ...pay, source: 'client' }, fields)).toBe(false);
    expect(paymentMatchesHeld({ ...pay, amount: 1, status: 'released' }, fields)).toBe(true);
    expect(paymentMatchesHeld({ ...pay, payeeId: 'x' }, fields)).toBe(false);
    expect(paymentMatchesHeld(undefined, fields)).toBe(false);
  });

  it('paymentMatchesJob compares ids and ignores the (poster-editable) job amount', () => {
    expect(paymentMatchesJob(pay, 'j1', job)).toBe(true);
    expect(paymentMatchesJob(pay, 'j1', { ...job, payment: 1 })).toBe(true);
    expect(paymentMatchesJob(pay, 'j1', { ...job, paymentType: 'volunteer' })).toBe(true);
    expect(paymentMatchesJob({ ...pay, payerId: 'x' }, 'j1', job)).toBe(false);
    expect(paymentMatchesJob({ ...pay, payeeId: 'x' }, 'j1', job)).toBe(false);
    expect(paymentMatchesJob({ ...pay, jobId: 'x' }, 'j1', job)).toBe(false);
    expect(paymentMatchesJob({ ...pay, source: 'client' }, 'j1', job)).toBe(false);
    expect(paymentMatchesJob(pay, 'j1', undefined)).toBe(false);
    expect(paymentMatchesJob(pay, 'j1', { ...job, assignedTo: 'w1' })).toBe(false);
    expect(paymentMatchesJob(pay, 'j1', { ...job, assignedTo: ['', 'w1'] })).toBe(true); // normalised payee
  });
});
