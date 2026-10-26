import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}`, id })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import { getDoc, updateDoc } from 'firebase/firestore';
import * as service from '@/services/user.service';

beforeEach(() => vi.clearAllMocks());

describe('user.service', () => {
  it('has no counter writers (the server maintains activeJobCount)', () => {
    expect(Object.keys(service).sort()).toEqual(['getUserById', 'updateUserProfile']);
  });
  it('updateUserProfile writes the given profile fields plus updatedAt', async () => {
    await service.updateUserProfile('u1', { bio: 'hi', skills: ['a'] });
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/u1' }), { bio: 'hi', skills: ['a'], updatedAt: 'SERVER_TS' });
  });
  it('getUserById returns null for a missing doc and { uid, ...data } otherwise', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(service.getUserById('x')).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: 'u1', data: () => ({ displayName: 'A', activeJobCount: 1 }) } as never);
    await expect(service.getUserById('u1')).resolves.toEqual({ uid: 'u1', displayName: 'A', activeJobCount: 1 });
  });
});
