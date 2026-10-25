import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/workHistory.service', () => ({ recordWorkHistory: vi.fn() }));
vi.mock('@/services/job.service', () => ({ getJobById: vi.fn(), updateJob: vi.fn() }));
vi.mock('@/services/payment.service', () => ({ getPaymentByJob: vi.fn(), releasePayment: vi.fn() }));
vi.mock('@/services/notification.service', () => {
  throw new Error('rating.service must not import notification.service');
});

import { addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { confirmCompletion } from '@/services/rating.service';
import { getJobById, updateJob } from '@/services/job.service';
import { getPaymentByJob, releasePayment } from '@/services/payment.service';
import { recordWorkHistory } from '@/services/workHistory.service';

const completion = (over: Record<string, unknown> = {}) => ({
  exists: () => true,
  data: () => ({ jobId: 'j1', workerConfirmed: false, posterConfirmed: false, status: 'pending', ...over }),
});

beforeEach(() => vi.clearAllMocks());

describe('confirmCompletion', () => {
  it('worker first: records the confirmation only (the server notifies the poster)', async () => {
    vi.mocked(getDoc).mockResolvedValue(completion() as never);
    await confirmCompletion('c1', 'worker');
    expect(updateDoc).toHaveBeenCalledWith({ _path: 'jobCompletions/c1' }, { workerConfirmed: true });
    expect(getJobById).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('poster last: confirms, records history, completes the job, releases a held payment, writes no notification', async () => {
    vi.mocked(getDoc).mockResolvedValue(completion({ workerConfirmed: true }) as never);
    vi.mocked(getJobById).mockResolvedValue({ id: 'j1', title: 'T', category: 'it', postedBy: 'p', assignedTo: ['w'] } as never);
    vi.mocked(getPaymentByJob).mockResolvedValue({ id: 'pay1', status: 'held' } as never);
    await confirmCompletion('c1', 'poster');
    expect(updateDoc).toHaveBeenCalledWith({ _path: 'jobCompletions/c1' }, { posterConfirmed: true, status: 'confirmed', completedAt: 'SERVER_TS' });
    expect(recordWorkHistory).toHaveBeenCalledWith('p', 'w', 'j1', 'T', 'it');
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'completed' });
    expect(releasePayment).toHaveBeenCalledWith('pay1');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('does nothing for a missing completion', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await confirmCompletion('nope', 'worker');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
