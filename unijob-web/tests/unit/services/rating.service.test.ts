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
vi.mock('@/services/workHistory.service', () => {
  throw new Error('rating.service must not import workHistory.service (the server writes work history)');
});
vi.mock('@/services/job.service', () => {
  throw new Error('rating.service must not import job.service (the server completes the job)');
});
vi.mock('@/services/payment.service', () => {
  throw new Error('rating.service must not import payment.service (the server releases the escrow)');
});
vi.mock('@/services/notification.service', () => {
  throw new Error('rating.service must not import notification.service');
});

import * as service from '@/services/rating.service';

beforeEach(() => vi.clearAllMocks());

describe('rating.service exports', () => {
  it('has no completion writers (the confirmCompletion callable owns them)', () => {
    expect(Object.keys(service).sort()).toEqual(['getJobCompletion', 'getRatingsByUser', 'submitRating']);
  });
});
