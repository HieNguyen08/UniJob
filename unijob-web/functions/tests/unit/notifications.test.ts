import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { writeNotification, type NotificationInput } from '../../src/lib/notifications.js';

type Call = { op: 'create' | 'set'; collection: string; id: string; data: Record<string, unknown> };

interface FakeOptions {
  /** Result of create(). */
  create?: () => Promise<unknown>;
  /** What the transactional read of the existing doc returns. */
  existing?: { exists: boolean; data?: Record<string, unknown> };
}

function fakeDb({ create = () => Promise.resolve(), existing = { exists: false } }: FakeOptions = {}) {
  const calls: Call[] = [];
  const ref = (collection: string, id: string) => ({
    create: (data: Record<string, unknown>) => {
      calls.push({ op: 'create', collection, id, data });
      return create();
    },
    __id: id,
    __collection: collection,
  });
  const db = {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        get: () => Promise.resolve({ exists: existing.exists, get: (field: string) => existing.data?.[field] }),
        set: (r: { __id: string; __collection: string }, data: Record<string, unknown>) => {
          calls.push({ op: 'set', collection: r.__collection, id: r.__id, data });
        },
      }),
  } as unknown as Firestore;
  return { db, calls };
}

const alreadyExists = () => Promise.reject(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }));

const input: NotificationInput = {
  userId: 'poster',
  type: 'new_application',
  message: 'Có ứng viên mới',
  extras: { jobId: 'job1', jobTitle: 'Nhập liệu', fromName: 'Carol' },
  sourceId: 'app1',
};

describe('writeNotification', () => {
  it('creates notifications/{type}_{sourceId} with source server, read false, a server timestamp and the given fields', async () => {
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, input)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    const { op, collection, id, data } = calls[0];
    expect(op).toBe('create');
    expect(collection).toBe('notifications');
    expect(id).toBe('new_application_app1');
    expect(data).toMatchObject({ userId: 'poster', type: 'new_application', message: 'Có ứng viên mới', read: false, source: 'server', jobId: 'job1', jobTitle: 'Nhập liệu', fromName: 'Carol' });
    expect(FieldValue.serverTimestamp().isEqual(data.createdAt as FieldValue)).toBe(true);
  });

  it('namespaces the same sourceId by type', async () => {
    const { db, calls } = fakeDb();
    await writeNotification(db, input);
    await writeNotification(db, { ...input, type: 'application_accepted' });
    expect(calls.map((c) => c.id)).toEqual(['new_application_app1', 'application_accepted_app1']);
  });

  it('returns false when the existing document was written by the server (true duplicate)', async () => {
    const { db, calls } = fakeDb({ create: alreadyExists, existing: { exists: true, data: { source: 'server' } } });
    await expect(writeNotification(db, input)).resolves.toBe(false);
    expect(calls.filter((c) => c.op === 'set')).toHaveLength(0);
  });

  it('replaces a squatted document (no source) and returns true', async () => {
    const { db, calls } = fakeDb({ create: alreadyExists, existing: { exists: true, data: { userId: 'poster', message: 'giả mạo' } } });
    await expect(writeNotification(db, input)).resolves.toBe(true);
    const set = calls.find((c) => c.op === 'set');
    expect(set?.id).toBe('new_application_app1');
    expect(set?.data).toMatchObject({ userId: 'poster', message: 'Có ứng viên mới', read: false, source: 'server' });
  });

  it('writes when the squatted document vanished between create and read', async () => {
    const { db, calls } = fakeDb({ create: alreadyExists, existing: { exists: false } });
    await expect(writeNotification(db, input)).resolves.toBe(true);
    expect(calls.some((c) => c.op === 'set')).toBe(true);
  });

  it('rethrows any other error', async () => {
    const { db } = fakeDb({ create: () => Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 7 })) });
    await expect(writeNotification(db, input)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('drops undefined, null and non-string extras and keys other than jobId, jobTitle, fromName', async () => {
    const { db, calls } = fakeDb();
    const extras = { jobId: 'job1', jobTitle: undefined, fromName: null, amount: 5 } as unknown as NotificationInput['extras'];
    await writeNotification(db, { ...input, extras });
    expect(calls[0].data).not.toHaveProperty('jobTitle');
    expect(calls[0].data).not.toHaveProperty('fromName');
    expect(calls[0].data).not.toHaveProperty('amount');
    expect(calls[0].data.jobId).toBe('job1');
  });

  it('drops a numeric jobId', async () => {
    const { db, calls } = fakeDb();
    await writeNotification(db, { ...input, extras: { jobId: 42 } as unknown as NotificationInput['extras'] });
    expect(calls[0].data).not.toHaveProperty('jobId');
  });

  it('core fields win over colliding extras', async () => {
    const { db, calls } = fakeDb();
    const extras = { userId: 'mallory', read: true, source: 'client', jobId: 'job1' } as unknown as NotificationInput['extras'];
    await writeNotification(db, { ...input, extras });
    expect(calls[0].data.userId).toBe('poster');
    expect(calls[0].data.read).toBe(false);
    expect(calls[0].data.source).toBe('server');
  });

  it.each(['', 'a/b', '.', '..', '__reserved__', 'x'.repeat(1501)])('rejects sourceId %j before writing', async (sourceId) => {
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, { ...input, sourceId })).rejects.toThrow(/sourceId/);
    expect(calls).toHaveLength(0);
  });

  it('rejects a sourceId that makes the full document id too long, naming the notification id', async () => {
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, { ...input, sourceId: 'x'.repeat(1490) })).rejects.toThrow(/invalid notification id/);
    expect(calls).toHaveLength(0);
  });

  // 'ế' is 3 UTF-8 bytes; the document id is `new_application_` (16 bytes) + sourceId, limit 1500 bytes.
  const prefix = 'new_application_';
  const fitting = Math.floor((1500 - Buffer.byteLength(prefix, 'utf8')) / 3);

  it('accepts a multi-byte sourceId whose full document id is just under 1500 bytes', async () => {
    const sourceId = 'ế'.repeat(fitting);
    expect(Buffer.byteLength(`${prefix}${sourceId}`, 'utf8')).toBe(1498);
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, { ...input, sourceId })).resolves.toBe(true);
    expect(calls[0].id).toBe(`${prefix}${sourceId}`);
  });

  it('rejects a multi-byte sourceId whose full document id is just over 1500 bytes (bytes, not chars)', async () => {
    const sourceId = 'ế'.repeat(fitting + 1);
    expect(Buffer.byteLength(sourceId, 'utf8')).toBeLessThanOrEqual(1500); // sourceId alone is fine
    expect(`${prefix}${sourceId}`.length).toBeLessThan(1500); // so is the char count
    expect(Buffer.byteLength(`${prefix}${sourceId}`, 'utf8')).toBe(1501);
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, { ...input, sourceId })).rejects.toThrow(/invalid notification id/);
    expect(calls).toHaveLength(0);
  });

  it('rejects an empty userId before writing', async () => {
    const { db, calls } = fakeDb();
    await expect(writeNotification(db, { ...input, userId: '' })).rejects.toThrow(/userId/);
    expect(calls).toHaveLength(0);
  });
});
