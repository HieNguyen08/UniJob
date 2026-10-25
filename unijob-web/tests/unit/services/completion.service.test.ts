import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP' }));

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  COMPLETION_ALREADY_DONE_MESSAGE,
  COMPLETION_CODE_MESSAGES,
  COMPLETION_FALLBACK_ERROR,
  COMPLETION_SERVER_MESSAGES,
  completionErrorMessage,
  completionSuccessMessage,
  confirmCompletion,
  isCompletionAlreadyDone,
  isCompletionPreconditionFailed,
} from '@/services/completion.service';

beforeEach(() => vi.clearAllMocks());

describe('confirmCompletion', () => {
  it('calls confirmCompletion in asia-southeast1 with only the jobId and returns the server state', async () => {
    callable.mockResolvedValue({ data: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
    await expect(confirmCompletion('j1')).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'confirmCompletion');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(confirmCompletion('j1')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

describe('completionSuccessMessage', () => {
  const done = { status: 'confirmed', workerConfirmed: true, posterConfirmed: true } as const;
  const waiting = { status: 'pending', workerConfirmed: true, posterConfirmed: false } as const;
  it.each(['worker', 'poster'] as const)('confirmed (%s) says the job is complete and rating is open', (role) => {
    expect(completionSuccessMessage(done, role)).toBe('Công việc đã hoàn thành! Bạn có thể đánh giá ngay.');
  });
  it('pending for the worker (first report or an idempotent repeat) says to wait for the poster', () => {
    expect(completionSuccessMessage(waiting, 'worker')).toBe('Đã gửi báo cáo hoàn thành! Chờ người đăng xác nhận.');
  });
  it('pending for the poster says to wait for the worker', () => {
    expect(completionSuccessMessage({ ...waiting, workerConfirmed: false, posterConfirmed: true }, 'poster'))
      .toBe('Đã xác nhận. Đang chờ người làm báo hoàn thành.');
  });
});

describe('completionErrorMessage', () => {
  it('passes every known server message through', () => {
    for (const m of [
      'Yêu cầu không hợp lệ.',
      'Chỉ có thể xác nhận hoàn thành khi công việc đang được thực hiện.',
      'Công việc này đã được xác nhận hoàn thành.',
      'Công việc này chưa có người làm hợp lệ.',
      'Người làm chưa báo hoàn thành công việc.',
      'Không tìm thấy công việc.',
      'Bạn cần đăng nhập để thực hiện thao tác này.',
      'Bạn không có quyền thực hiện thao tác này với công việc này.',
      'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
    ]) expect(COMPLETION_SERVER_MESSAGES.has(m)).toBe(true);
    for (const message of COMPLETION_SERVER_MESSAGES) {
      expect(completionErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(completionErrorMessage(err)).toBe(COMPLETION_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(COMPLETION_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(COMPLETION_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(completionErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(COMPLETION_FALLBACK_ERROR);
    expect(completionErrorMessage(new Error('network'))).toBe(COMPLETION_FALLBACK_ERROR);
  });
});

describe('isCompletionAlreadyDone', () => {
  it('is true only for the already-completed failed-precondition', () => {
    expect(isCompletionAlreadyDone({ code: 'functions/failed-precondition', message: COMPLETION_ALREADY_DONE_MESSAGE })).toBe(true);
    expect(isCompletionAlreadyDone({ code: 'functions/failed-precondition', message: 'Người làm chưa báo hoàn thành công việc.' })).toBe(false);
    expect(isCompletionAlreadyDone({ code: 'functions/internal', message: COMPLETION_ALREADY_DONE_MESSAGE })).toBe(false);
    expect(isCompletionAlreadyDone(new Error('x'))).toBe(false);
  });
});

describe('isCompletionPreconditionFailed', () => {
  it('is true for any failed-precondition only', () => {
    expect(isCompletionPreconditionFailed({ code: 'functions/failed-precondition', message: 'x' })).toBe(true);
    expect(isCompletionPreconditionFailed({ code: 'functions/not-found' })).toBe(false);
    expect(isCompletionPreconditionFailed(null)).toBe(false);
  });
});
