import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchOps = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ _col: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  writeBatch: vi.fn(() => batchOps),
  arrayUnion: vi.fn((...v: unknown[]) => ({ _union: v })),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/notification.service', () => ({ createNotification: vi.fn() }));
vi.mock('@/services/payment.service', () => ({ createPayment: vi.fn() }));

import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { createNotification } from '@/services/notification.service';
import { acceptApplication, applyForJob, hasAppliedToJob, updateApplicationStatus } from '@/services/job.service';

const snap = (exists: boolean, data: Record<string, unknown> = {}) => ({ exists: () => exists, data: () => data });
const callFor = (fn: { mock: { calls: unknown[][] } }, path: string) =>
  fn.mock.calls.find((c) => (c[0] as { _path: string })._path === path);

beforeEach(() => {
  vi.clearAllMocks();
  batchOps.commit.mockResolvedValue(undefined);
});

describe('applyForJob', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1' ? snap(false) : snap(true, { postedBy: 'p', title: 'T' })) as never);
  });

  it('batches the application set and the applicants arrayUnion, then commits', async () => {
    const id = await applyForJob('j1', 'u1', 'Name', 'photo', 'msg');
    expect(id).toBe('j1_u1');
    expect(callFor(batchOps.set, 'applications/j1_u1')).toBeTruthy();
    expect(callFor(batchOps.update, 'jobs/j1')?.[1]).toEqual({
      applicants: { _union: ['u1'] },
      updatedAt: 'SERVER_TS',
    });
    expect(batchOps.commit).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('throws and writes nothing when the application already exists', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true) as never);
    await expect(applyForJob('j1', 'u1', 'N', '', 'm')).rejects.toThrow('Bạn đã ứng tuyển công việc này rồi');
    expect(batchOps.set).not.toHaveBeenCalled();
    expect(batchOps.commit).not.toHaveBeenCalled();
  });

  it('surfaces a commit failure and sends no notification', async () => {
    batchOps.commit.mockRejectedValue(new Error('denied'));
    await expect(applyForJob('j1', 'u1', 'N', '', 'm')).rejects.toThrow('denied');
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('hasAppliedToJob', () => {
  it('is true when the application exists', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true) as never);
    expect(await hasAppliedToJob('j1', 'u1')).toBe(true);
    expect(getDoc).toHaveBeenCalledWith({ _path: 'applications/j1_u1' });
  });
  it('is false when it does not', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(false) as never);
    expect(await hasAppliedToJob('j1', 'u1')).toBe(false);
  });
});

describe('acceptApplication', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1'
        ? snap(true, { jobId: 'j1', applicantId: 'u1' })
        : snap(true, { title: 'T', postedBy: 'p', paymentType: 'fixed', payment: 5 })) as never);
  });

  it('commits one batch with the application and the job update', async () => {
    await acceptApplication('j1', 'j1_u1', 'u1');
    expect(callFor(batchOps.update, 'applications/j1_u1')?.[1]).toEqual({ status: 'accepted', updatedAt: 'SERVER_TS' });
    expect(callFor(batchOps.update, 'jobs/j1')?.[1]).toEqual({
      assignedTo: ['u1'],
      status: 'in-progress',
      updatedAt: 'SERVER_TS',
    });
    expect(batchOps.commit).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('surfaces a commit failure and runs no side effects', async () => {
    batchOps.commit.mockRejectedValue(new Error('denied'));
    await expect(acceptApplication('j1', 'j1_u1', 'u1')).rejects.toThrow('denied');
    expect(createNotification).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  describe('with other pending applications', () => {
    beforeEach(() => {
      vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) => {
        const m = /^applications\/j1_(u\d)$/.exec(ref._path);
        return m
          ? snap(true, { jobId: 'j1', applicantId: m[1] })
          : snap(true, { title: 'T', postedBy: 'p', paymentType: 'fixed', payment: 5 });
      }) as never);
    });

    it('rejects the other pending applications in the same batch', async () => {
      await acceptApplication('j1', 'j1_u1', 'u1', ['j1_u2', 'j1_u3']);
      expect(callFor(batchOps.update, 'applications/j1_u1')?.[1]).toEqual({ status: 'accepted', updatedAt: 'SERVER_TS' });
      expect(callFor(batchOps.update, 'jobs/j1')?.[1]).toEqual({
        assignedTo: ['u1'],
        status: 'in-progress',
        updatedAt: 'SERVER_TS',
      });
      for (const id of ['applications/j1_u2', 'applications/j1_u3']) {
        expect(callFor(batchOps.update, id)?.[1]).toEqual({ status: 'rejected', updatedAt: 'SERVER_TS' });
      }
      expect(batchOps.update).toHaveBeenCalledTimes(4);
      expect(batchOps.commit).toHaveBeenCalledTimes(1);
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('runs side effects for the accepted and every rejected application only after commit', async () => {
      const order: string[] = [];
      batchOps.commit.mockImplementation(async () => {
        order.push('commit');
      });
      vi.mocked(createNotification).mockImplementation((async (uid: string, type: string) => {
        order.push(`${type}:${uid}`);
      }) as never);
      await acceptApplication('j1', 'j1_u1', 'u1', ['j1_u2', 'j1_u3']);
      expect(order[0]).toBe('commit');
      expect(order.slice(1).sort()).toEqual([
        'application_accepted:u1',
        'application_rejected:u2',
        'application_rejected:u3',
      ]);
    });

    it('runs no side effects when the commit fails', async () => {
      batchOps.commit.mockRejectedValue(new Error('denied'));
      await expect(acceptApplication('j1', 'j1_u1', 'u1', ['j1_u2'])).rejects.toThrow('denied');
      expect(createNotification).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('does not reject the accepted application itself', async () => {
      await acceptApplication('j1', 'j1_u1', 'u1', ['j1_u1', 'j1_u2']);
      expect(batchOps.update.mock.calls.filter((c) => (c[0] as { _path: string })._path === 'applications/j1_u1')).toHaveLength(1);
      expect(batchOps.update).toHaveBeenCalledTimes(3);
    });

    it('throws before writing when there are more than 450 other applications', async () => {
      const many = Array.from({ length: 451 }, (_v, i) => `j1_x${i}`);
      await expect(acceptApplication('j1', 'j1_u1', 'u1', many)).rejects.toThrow(/450/);
      expect(batchOps.update).not.toHaveBeenCalled();
      expect(batchOps.commit).not.toHaveBeenCalled();
      await acceptApplication('j1', 'j1_u1', 'u1', many.slice(0, 450));
      expect(batchOps.update).toHaveBeenCalledTimes(452);
    });
  });
});

describe('updateApplicationStatus', () => {
  it('updates the application and notifies the applicant on reject', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(true, { jobId: 'j1', applicantId: 'u1', title: 'T' }) as never);
    await updateApplicationStatus('j1_u1', 'rejected');
    expect(callFor(vi.mocked(updateDoc), 'applications/j1_u1')?.[1]).toEqual({
      status: 'rejected',
      updatedAt: 'SERVER_TS',
    });
    expect(createNotification).toHaveBeenCalledWith('u1', 'application_rejected', expect.any(String), expect.anything());
  });
});
