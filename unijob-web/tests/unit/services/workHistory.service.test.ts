import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ _col: name })),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  or: vi.fn(),
  Timestamp: class {},
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/user.service', () => ({ getUserById: vi.fn() }));

import { getDocs } from 'firebase/firestore';
import { getUserById } from '@/services/user.service';
import { getSmartMatchedWorkers, getWorkHistory, haveWorkedTogether } from '@/services/workHistory.service';

const d = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
const snap = (docs: ReturnType<typeof d>[]) => ({ docs, empty: docs.length === 0 });
const server = (id: string, user2 = 'w1') => d(id, { user1: 'p', user2, jobId: 'j', jobTitle: 'T', category: 'c', source: 'server', serverVersion: 'completion-v1' });
const sourceOnly = (id: string) => d(id, { user1: 'p', user2: 'w3', jobId: 'j', source: 'server' });
const legacy = (id: string, user2 = 'w2') => d(id, { user1: 'p', user2, jobId: 'j', jobTitle: 'T', category: 'c' });

beforeEach(() => vi.clearAllMocks());

describe('workHistory reads ignore docs without source server', () => {
  it('getWorkHistory', async () => {
    vi.mocked(getDocs).mockResolvedValue(snap([server('a'), legacy('b'), sourceOnly('c')]) as never);
    const res = await getWorkHistory('p');
    expect(res.map((e) => e.id)).toEqual(['a']);
  });

  it('haveWorkedTogether is false with only legacy docs and true with a server doc', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(snap([legacy('b')]) as never).mockResolvedValueOnce(snap([]) as never);
    await expect(haveWorkedTogether('p', 'w2')).resolves.toBe(false);
    vi.mocked(getDocs).mockResolvedValueOnce(snap([]) as never).mockResolvedValueOnce(snap([server('a')]) as never);
    await expect(haveWorkedTogether('p', 'w1')).resolves.toBe(true);
  });

  it('getSmartMatchedWorkers only counts server docs', async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(snap([server('a'), legacy('b'), sourceOnly('c')]) as never) // workHistory
      .mockResolvedValueOnce(snap([]) as never); // completed jobs
    vi.mocked(getUserById).mockResolvedValue({ displayName: 'W', photoURL: '', faculty: 'f', ratingScore: 5, totalRatings: 3 } as never);
    const res = await getSmartMatchedWorkers('p');
    expect(res.map((w) => w.uid)).toEqual(['w1']);
    expect(getUserById).not.toHaveBeenCalledWith('w2');
    expect(getUserById).not.toHaveBeenCalledWith('w3');
  });
});
