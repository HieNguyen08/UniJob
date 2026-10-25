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
vi.mock('@/services/workHistory.service', () => ({ recordWorkHistory: vi.fn() }));
vi.mock('@/services/job.service', () => ({ getJobById: vi.fn(), updateJob: vi.fn() }));
vi.mock('@/services/notification.service', () => ({ createNotification: vi.fn() }));
vi.mock('@/services/payment.service', () => {
  throw new Error('rating.service must not import payment.service (the server releases the escrow)');
});

import { addDoc, getDoc, getDocs, query, setDoc } from 'firebase/firestore';
import { createJobCompletion, getJobCompletion } from '@/services/rating.service';

const snap = (exists: boolean, data: Record<string, unknown> = {}, id = 'job1') => ({
  id,
  exists: () => exists,
  data: () => data,
});
const pathOf = (ref: unknown) => (ref as { _path: string })._path;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createJobCompletion', () => {
  it('creates the single completion at jobCompletions/{jobId} with the pending shape the rules require', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(false) as never);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const id = await createJobCompletion('job1');

    expect(id).toBe('job1');
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect(pathOf(ref)).toBe('jobCompletions/job1');
    expect(data).toEqual({ jobId: 'job1', workerConfirmed: false, posterConfirmed: false, completedAt: null, status: 'pending' });
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('reuses an existing completion for the job instead of overwriting it', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true, { jobId: 'job1', posterConfirmed: true }) as never);

    const id = await createJobCompletion('job1');

    expect(id).toBe('job1');
    expect(pathOf(vi.mocked(getDoc).mock.calls[0][0])).toBe('jobCompletions/job1');
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('getJobCompletion', () => {
  it('reads jobCompletions/{jobId} with a get, never a list query', async () => {
    const data = { jobId: 'job1', workerConfirmed: true, posterConfirmed: false, completedAt: null, status: 'pending' };
    vi.mocked(getDoc).mockResolvedValue(snap(true, data) as never);

    const completion = await getJobCompletion('job1');

    expect(pathOf(vi.mocked(getDoc).mock.calls[0][0])).toBe('jobCompletions/job1');
    expect(completion).toEqual({ id: 'job1', ...data });
    expect(getDocs).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
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
