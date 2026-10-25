import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ _col: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((_c: unknown, ...w: unknown[]) => ({ _where: w })),
  where: vi.fn((f: string, op: string, v: unknown) => `${f}${op}${String(v)}`),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/job.service', () => {
  throw new Error('payment.service must not import job.service');
});

import { getDoc, getDocs } from 'firebase/firestore';
import * as service from '@/services/payment.service';
import { getPaymentForJob, getPaymentsByUser } from '@/services/payment.service';

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const snap = (id: string, data: Record<string, unknown> | null) => ({ id, exists: () => data !== null, data: () => data });
const qs = (...docs: { id: string; data: Record<string, unknown> }[]) => ({
  empty: docs.length === 0,
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});
const whereCalls = () => vi.mocked(getDocs).mock.calls.map((c) => (c[0] as unknown as { _where: string[] })._where);

beforeEach(() => vi.clearAllMocks());

describe('payment.service exports', () => {
  it('only reads payments (the server creates, releases and disputes them)', () => {
    expect(Object.keys(service).sort()).toEqual(['getPaymentById', 'getPaymentForJob', 'getPaymentsByUser']);
  });
});

describe('getPaymentForJob', () => {
  const job = { id: 'j1', assignedTo: ['w'] };

  it('reads the server payment payments/{jobId}_{payee} and does not query', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('j1_w', { jobId: 'j1', status: 'held' }) as never);
    await expect(getPaymentForJob(job, 'p')).resolves.toEqual({ id: 'j1_w', jobId: 'j1', status: 'held' });
    expect(getDoc).toHaveBeenCalledWith({ _path: 'payments/j1_w' });
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('falls back to a legacy payment as payer, then as payee, newest first', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied() as never);
    vi.mocked(getDocs)
      .mockResolvedValueOnce(qs() as never)
      .mockResolvedValueOnce(
        qs(
          { id: 'old', data: { jobId: 'j1', createdAt: { seconds: 1 } } },
          { id: 'new', data: { jobId: 'j1', createdAt: { seconds: 2 } } },
        ) as never,
      );
    await expect(getPaymentForJob(job, 'w')).resolves.toMatchObject({ id: 'new' });
    expect(whereCalls()).toEqual([
      ['jobId==j1', 'payerId==w'],
      ['jobId==j1', 'payeeId==w'],
    ]);
  });

  it('skips the get when the job has no assignee, and returns null when nothing is found', async () => {
    vi.mocked(getDocs).mockResolvedValue(qs() as never);
    await expect(getPaymentForJob({ id: 'j1', assignedTo: [] }, 'p')).resolves.toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('returns null for an outsider (every read denied)', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied() as never);
    vi.mocked(getDocs).mockRejectedValue(denied() as never);
    await expect(getPaymentForJob(job, 'mallory')).resolves.toBeNull();
  });

  it('returns null without reading when there is no signed-in uid', async () => {
    await expect(getPaymentForJob(job, '')).resolves.toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('rethrows errors other than permission-denied', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }) as never);
    await expect(getPaymentForJob(job, 'p')).rejects.toThrow('offline');
  });
});

describe('getPaymentsByUser', () => {
  it('merges payer and payee payments without duplicates, newest first', async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(qs({ id: 'a', data: { createdAt: { seconds: 1 } } }, { id: 'b', data: { createdAt: { seconds: 3 } } }) as never)
      .mockResolvedValueOnce(qs({ id: 'b', data: { createdAt: { seconds: 3 } } }) as never);
    const res = await getPaymentsByUser('u');
    expect(res.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

const SRC = join(process.cwd(), 'src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no client code writes payments', () => {
  const files = sourceFiles(SRC);
  it.each(files.map((f) => [relative(SRC, f), f]))('%s never calls the removed escrow writers or writes paymentStatus', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(createPayment|releasePayment|refundPayment|getPaymentByJob|createEscrowForAccepted)\b/);
    expect(text).not.toMatch(/paymentStatus\s*:/); // the type declares `paymentStatus?:`, writes would be `paymentStatus:`
  });
  it('payment.service.ts has no Firestore write API', () => {
    const text = readFileSync(join(SRC, 'services', 'payment.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  });
});
