import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}`, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  deleteField: vi.fn(() => 'DELETE'),
}));
vi.mock('@/lib/firebase', () => ({ auth: {}, googleProvider: {}, db: {} }));

import { signInWithPopup } from 'firebase/auth';
import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signInWithGoogle } from '@/services/auth.service';

const user = { uid: 'u1', email: 'u1@hcmut.edu.vn', displayName: 'U One', photoURL: 'p.png' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(signInWithPopup).mockResolvedValue({ user } as never);
});

describe('signInWithGoogle', () => {
  it('creates the profile on the first sign-in', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await signInWithGoogle();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('leaves an existing profile alone', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ stub: false, displayName: 'x' }) } as never);
    await signInWithGoogle();
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('completes a server stub with profile fields only (no server-owned fields)', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ uid: 'u1', stub: true, ratingScore: 3, penaltyPoints: 10 }) } as never);
    await signInWithGoogle();
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [{ _path: string }, Record<string, unknown>];
    expect(ref._path).toBe('users/u1');
    expect(data).toEqual({
      email: 'u1@hcmut.edu.vn', displayName: 'U One', photoURL: 'p.png', faculty: '', department: '', studentId: '', phone: '',
      bio: '', skills: [], bookmarks: [], isAnonymous: false, maxJobLimit: 2, createdAt: 'SERVER_TS', updatedAt: 'SERVER_TS', stub: 'DELETE',
    });
    for (const k of ['uid', 'ratingScore', 'totalRatings', 'activeJobCount', 'penaltyPoints', 'ratingAverage', 'completedJobs']) expect(data).not.toHaveProperty(k);
  });
});
