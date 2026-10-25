import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP' }));

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  DISPUTE_CODE_MESSAGES,
  DISPUTE_FALLBACK_ERROR,
  DISPUTE_SERVER_MESSAGES,
  canDisputePayment,
  disputeErrorMessage,
  disputePayment,
  validateDisputeReason,
} from '@/services/dispute.service';

beforeEach(() => vi.clearAllMocks());

describe('disputePayment', () => {
  it('calls disputePayment in asia-southeast1 with the trimmed reason', async () => {
    callable.mockResolvedValue({ data: { disputed: true } });
    await expect(disputePayment('j1', '  Không làm đúng yêu cầu  ')).resolves.toEqual({ disputed: true });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'disputePayment');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', reason: 'Không làm đúng yêu cầu' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(disputePayment('j1', 'Lý do đủ dài ở đây')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

describe('validateDisputeReason', () => {
  it.each(['', '          ', '123456789', '   123456789   '])('rejects %j as too short', (r) => {
    expect(validateDisputeReason(r)).toBe('Lý do cần ít nhất 10 ký tự.');
  });
  it('rejects more than 500 characters after trimming', () => {
    expect(validateDisputeReason('a'.repeat(501))).toBe('Lý do tối đa 500 ký tự.');
  });
  it('counts code points, not UTF-16 units (matches the server)', () => {
    expect(validateDisputeReason('😡'.repeat(10))).toBeNull();
    expect(validateDisputeReason('😡'.repeat(9))).toBe('Lý do cần ít nhất 10 ký tự.');
    expect(validateDisputeReason('😡'.repeat(500))).toBeNull();
    expect(validateDisputeReason('😡'.repeat(501))).toBe('Lý do tối đa 500 ký tự.');
  });
  it.each(['1234567890', `  ${'a'.repeat(500)}  `])('accepts %j', (r) => {
    expect(validateDisputeReason(r)).toBeNull();
  });
});

describe('canDisputePayment', () => {
  const p = { id: 'j1_w', jobId: 'j1', payerId: 'p', payeeId: 'w', status: 'held' as const };
  it('allows payer and payee on a held server payment', () => {
    expect(canDisputePayment(p, 'p')).toBe(true);
    expect(canDisputePayment(p, 'w')).toBe(true);
  });
  it.each([
    ['an outsider', p, 'x'],
    ['no user', p, undefined],
    ['a released payment', { ...p, status: 'released' as const }, 'p'],
    ['an already disputed payment', { ...p, status: 'disputed' as const }, 'p'],
    ['a legacy random-id payment', { ...p, id: 'AbC123random' }, 'p'],
  ])('denies %s', (_name, payment, uid) => {
    expect(canDisputePayment(payment, uid)).toBe(false);
  });
});

describe('disputeErrorMessage', () => {
  it('passes every known server message through', () => {
    expect(DISPUTE_SERVER_MESSAGES.has('Chưa có thanh toán ký quỹ cho công việc này.')).toBe(true);
    for (const message of DISPUTE_SERVER_MESSAGES) {
      expect(disputeErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(disputeErrorMessage(err)).toBe(DISPUTE_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(DISPUTE_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(DISPUTE_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(disputeErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(DISPUTE_FALLBACK_ERROR);
    expect(disputeErrorMessage(new Error('network'))).toBe(DISPUTE_FALLBACK_ERROR);
  });
});
