import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP', db: {} }));
vi.mock('@/services/user.service', () => {
  throw new Error('cancel.service must not import user.service (the server applies penalties)');
});
vi.mock('@/services/job.service', () => {
  throw new Error('cancel.service must not import job.service (the server changes job and application status)');
});
vi.mock('@/services/notification.service', () => {
  throw new Error('cancel.service must not import notification.service');
});

import { getFunctions, httpsCallable } from 'firebase/functions';
import * as service from '@/services/cancel.service';
import {
  CANCEL_CODE_MESSAGES,
  CANCEL_FALLBACK_ERROR,
  CANCEL_REASONS,
  CANCEL_SERVER_MESSAGES,
  cancelErrorMessage,
  cancelJob,
  cancelSuccessMessage,
  isCancelPreconditionFailed,
} from '@/services/cancel.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancel.service exports', () => {
  it('has no client cancel writers (the cancelJob callable owns them)', () => {
    expect(Object.keys(service).sort()).toEqual([
      'CANCEL_CODE_MESSAGES', 'CANCEL_FALLBACK_ERROR', 'CANCEL_REASONS', 'CANCEL_SERVER_MESSAGES',
      'cancelErrorMessage', 'cancelJob', 'cancelSuccessMessage', 'isCancelPreconditionFailed',
    ]);
  });
});

describe('cancelJob', () => {
  it('calls cancelJob in asia-southeast1 with only jobId and reason and returns the server result', async () => {
    callable.mockResolvedValue({ data: { penaltyPoints: 10, status: 'open' } });
    await expect(cancelJob('j1', 'Khác')).resolves.toEqual({ penaltyPoints: 10, status: 'open' });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'cancelJob');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', reason: 'Khác' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(cancelJob('j1', 'Khác')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
  it('offers exactly the four reasons the server accepts', () => {
    expect(CANCEL_REASONS).toEqual(['Không thể hoàn thành đúng deadline', 'Yêu cầu công việc thay đổi quá nhiều', 'Lý do cá nhân khẩn cấp', 'Khác']);
  });
});

describe('cancelSuccessMessage', () => {
  it.each([
    [{ status: 'open', penaltyPoints: 20 }, 'Hủy sát giờ — bạn bị trừ 20 điểm uy tín.'],
    [{ status: 'open', penaltyPoints: 10 }, 'Đã hủy — bạn bị trừ 10 điểm uy tín.'],
    [{ status: 'open', penaltyPoints: 5 }, 'Đã hủy — bạn bị trừ 5 điểm uy tín.'],
    [{ status: 'cancelled', penaltyPoints: 5 }, 'Đã hủy việc — bạn bị trừ 5 điểm uy tín vì đã có người nhận việc.'],
    [{ status: 'cancelled', penaltyPoints: 0 }, 'Đã hủy việc thành công.'],
    [{ status: 'open', penaltyPoints: 0 }, 'Đã hủy việc thành công.'],
  ] as const)('%j -> %s (penalty from the server)', (result, text) => {
    expect(cancelSuccessMessage(result)).toBe(text);
  });
});

describe('cancelErrorMessage', () => {
  it('passes every known server message through', () => {
    for (const m of [
      'Yêu cầu không hợp lệ.',
      'Lý do hủy không hợp lệ.',
      'Vui lòng chọn lý do hủy công việc.',
      'Không thể hủy công việc ở trạng thái hiện tại.',
      'Công việc này đã bị hủy.',
      'Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.',
      'Bạn đã báo hoàn thành công việc này nên không thể hủy.',
      'Thanh toán ký quỹ đang bị tranh chấp nên không thể hủy công việc.',
      'Không tìm thấy công việc.',
      'Bạn cần đăng nhập để thực hiện thao tác này.',
      'Bạn không có quyền thực hiện thao tác này với công việc này.',
      'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
    ]) expect(CANCEL_SERVER_MESSAGES.has(m)).toBe(true);
    for (const message of CANCEL_SERVER_MESSAGES) {
      expect(cancelErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(cancelErrorMessage(err)).toBe(CANCEL_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(CANCEL_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(CANCEL_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(cancelErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(CANCEL_FALLBACK_ERROR);
    expect(cancelErrorMessage(new Error('network'))).toBe(CANCEL_FALLBACK_ERROR);
  });
});

describe('isCancelPreconditionFailed', () => {
  it('is true only for functions/failed-precondition', () => {
    expect(isCancelPreconditionFailed({ code: 'functions/failed-precondition', message: 'x' })).toBe(true);
    expect(isCancelPreconditionFailed({ code: 'functions/permission-denied' })).toBe(false);
    expect(isCancelPreconditionFailed(null)).toBe(false);
  });
});
