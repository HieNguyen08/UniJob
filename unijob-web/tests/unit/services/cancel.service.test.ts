import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/user.service', () => ({ getUserById: vi.fn(), updateUserProfile: vi.fn() }));
vi.mock('@/services/job.service', () => ({ getJobById: vi.fn(), updateJob: vi.fn(), updateApplicationStatus: vi.fn() }));
vi.mock('@/services/notification.service', () => {
  throw new Error('cancel.service must not import notification.service');
});

import { posterCancelJob, workerCancelJob } from '@/services/cancel.service';
import { getJobById, updateApplicationStatus, updateJob } from '@/services/job.service';
import { getUserById, updateUserProfile } from '@/services/user.service';

const inHours = (h: number) => ({ toDate: () => new Date(Date.now() + h * 3_600_000) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserById).mockResolvedValue({ ratingScore: 4.5, activeJobCount: 2 } as never);
});

describe('posterCancelJob', () => {
  it('cancels without penalty when no worker is assigned, and reads no job for a notification', async () => {
    await expect(posterCancelJob('j1', 'poster', false)).resolves.toEqual({ penaltyPoints: 0, message: 'Đã hủy việc thành công.' });
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'cancelled' });
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(getJobById).not.toHaveBeenCalled();
  });
  it('applies the 5-point penalty when a worker is assigned', async () => {
    const res = await posterCancelJob('j1', 'poster', true);
    expect(res.penaltyPoints).toBe(5);
    expect(updateUserProfile).toHaveBeenCalledWith('poster', { ratingScore: 4 });
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'cancelled' });
  });
});

describe('workerCancelJob', () => {
  it.each([
    [6, 20],
    [18, 10],
    [72, 5],
  ])('%dh before the deadline costs %d points', async (hours, points) => {
    const res = await workerCancelJob('j1', 'j1_w', 'w', 'Khác', inHours(hours));
    expect(res.penaltyPoints).toBe(points);
  });
  it('without a deadline costs 5, rejects the application, reopens the job, sends nothing', async () => {
    const res = await workerCancelJob('j1', 'j1_w', 'w', 'Khác', null);
    expect(res).toEqual({ penaltyPoints: 5, message: 'Đã hủy — bạn bị trừ 5 điểm uy tín.' });
    expect(updateUserProfile).toHaveBeenCalledWith('w', { ratingScore: 4, activeJobCount: 1 });
    expect(updateApplicationStatus).toHaveBeenCalledWith('j1_w', 'rejected');
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'open' });
    expect(getJobById).not.toHaveBeenCalled();
  });
});
