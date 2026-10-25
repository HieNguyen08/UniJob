import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP' }));

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  INVITE_CODE_MESSAGES,
  INVITE_FALLBACK_ERROR,
  INVITE_SERVER_MESSAGES,
  inviteErrorMessage,
  sendJobInvite,
} from '@/services/invite.service';

beforeEach(() => vi.clearAllMocks());

describe('sendJobInvite', () => {
  it('calls the sendJobInvite callable in asia-southeast1 and returns its data', async () => {
    callable.mockResolvedValue({ data: { sent: true } });
    await expect(sendJobInvite('j1', 'bob')).resolves.toEqual({ sent: true });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'sendJobInvite');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', workerId: 'bob' });
  });
  it('passes sent: false through for a repeat invite', async () => {
    callable.mockResolvedValue({ data: { sent: false } });
    await expect(sendJobInvite('j1', 'bob')).resolves.toEqual({ sent: false });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('Chỉ người đăng việc mới gửi được lời mời.'), { code: 'functions/permission-denied' }));
    await expect(sendJobInvite('j1', 'bob')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('inviteErrorMessage', () => {
  it.each([
    ['invalid-argument', 'Lời mời không hợp lệ.'],
    ['invalid-argument', 'Bạn không thể tự mời chính mình.'],
    ['permission-denied', 'Chỉ người đăng việc mới gửi được lời mời.'],
    ['failed-precondition', 'Công việc này không còn nhận ứng viên.'],
    ['not-found', 'Không tìm thấy người được mời.'],
    ['not-found', 'Không tìm thấy công việc.'],
    ['unauthenticated', 'Bạn cần đăng nhập để thực hiện thao tác này.'],
  ])('passes the known server message through for functions/%s: %s', (code, message) => {
    expect(INVITE_SERVER_MESSAGES.has(message)).toBe(true);
    expect(inviteErrorMessage({ code: `functions/${code}`, message })).toBe(message);
  });

  it.each([
    // SDK-built errors from HTTP status codes: message is the code name (function not deployed, wrong region, IAM)
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'],
    [{ code: 'functions/permission-denied', message: 'PERMISSION_DENIED' }, 'permission-denied'],
    [{ code: 'functions/unauthenticated', message: '' }, 'unauthenticated'],
    [{ code: 'functions/invalid-argument', message: 'INVALID_ARGUMENT' }, 'invalid-argument'],
    [{ code: 'functions/failed-precondition', message: 'failed-precondition' }, 'failed-precondition'],
    // an unknown string is never shown, even for a user-facing code
    [{ code: 'functions/not-found', message: 'Thông điệp lạ' }, 'not-found'],
  ] as const)('uses the local Vietnamese message for %j', (err, code) => {
    const msg = inviteErrorMessage(err);
    expect(msg).toBe(INVITE_CODE_MESSAGES[code]);
    expect(msg).not.toBe(err.message);
  });

  it('has a distinct Vietnamese message for every user-facing code', () => {
    expect(Object.keys(INVITE_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(INVITE_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
  });

  it.each([
    { code: 'functions/internal', message: 'internal' },
    { code: 'functions/internal', message: 'Không tìm thấy công việc.' },
    { code: 'functions/unavailable', message: 'unavailable' },
    { code: 'not-functions', message: 'Không tìm thấy công việc.' },
    new Error('network'),
    undefined,
    null,
    'boom',
  ])('falls back for %j', (err) => {
    expect(inviteErrorMessage(err)).toBe(INVITE_FALLBACK_ERROR);
  });
});
