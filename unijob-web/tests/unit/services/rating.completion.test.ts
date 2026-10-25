import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ _col: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/workHistory.service', () => {
  throw new Error('rating.service must not import workHistory.service (the server writes work history)');
});
vi.mock('@/services/job.service', () => {
  throw new Error('rating.service must not import job.service (the server completes the job)');
});
vi.mock('@/services/notification.service', () => ({ createNotification: vi.fn() }));
vi.mock('@/services/payment.service', () => {
  throw new Error('rating.service must not import payment.service (the server releases the escrow)');
});

import { getDoc, getDocs, query } from 'firebase/firestore';
import { getJobCompletion } from '@/services/rating.service';

const snap = (exists: boolean, data: Record<string, unknown> = {}, id = 'job1') => ({
  id,
  exists: () => exists,
  data: () => data,
});
const pathOf = (ref: unknown) => (ref as { _path: string })._path;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getJobCompletion', () => {
  it('reads jobCompletions/{jobId} with a get, never a list query', async () => {
    const data = { jobId: 'job1', workerConfirmed: true, posterConfirmed: false, completedAt: null, status: 'pending', source: 'server', serverVersion: 'completion-v1' };
    vi.mocked(getDoc).mockResolvedValue(snap(true, data) as never);

    const completion = await getJobCompletion('job1');

    expect(pathOf(vi.mocked(getDoc).mock.calls[0][0])).toBe('jobCompletions/job1');
    expect(completion).toEqual({ id: 'job1', ...data });
    expect(getDocs).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns null for a legacy completion without source server (the server ignores it too)', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true, { jobId: 'job1', workerConfirmed: true, posterConfirmed: true, status: 'confirmed' }) as never);
    await expect(getJobCompletion('job1')).resolves.toBeNull();
  });

  it('returns null for a source-only doc without the version marker', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true, { jobId: 'job1', source: 'server', status: 'confirmed' }) as never);
    await expect(getJobCompletion('job1')).resolves.toBeNull();
  });

  it('returns null when the doc jobId does not match its id', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true, { jobId: 'other', source: 'server', serverVersion: 'completion-v1' }) as never);
    await expect(getJobCompletion('job1')).resolves.toBeNull();
  });

  it('returns null when the job has no completion yet', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(false) as never);
    await expect(getJobCompletion('job1')).resolves.toBeNull();
  });

  it('returns null when the caller is not a member of the job (rules deny the get)', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await expect(getJobCompletion('job1')).resolves.toBeNull();
  });

  it('rethrows other errors', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(getJobCompletion('job1')).rejects.toThrow('offline');
  });
});
