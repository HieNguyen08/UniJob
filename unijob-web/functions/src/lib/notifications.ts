import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { NotificationType } from './types.js';

export interface NotificationExtras {
  jobId?: string;
  jobTitle?: string;
  fromName?: string;
}

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  message: string;
  extras?: NotificationExtras;
  /**
   * Id of the thing that caused the notification (e.g. the application id). The document id is
   * `${type}_${sourceId}`, so the same event always maps to the same document and different
   * notification types never collide.
   */
  sourceId: string;
}

const EXTRA_KEYS = ['jobId', 'jobTitle', 'fromName'] as const;
const GRPC_ALREADY_EXISTS = 6;
const MAX_ID_BYTES = 1500;

/** Firestore document-id rules; a '/' would silently write into a subcollection path. */
function assertValidId(id: string, label: string): void {
  const invalid =
    !id ||
    id.includes('/') ||
    id === '.' ||
    id === '..' ||
    /^__.*__$/.test(id) ||
    Buffer.byteLength(id, 'utf8') > MAX_ID_BYTES;
  if (invalid) throw new Error(`writeNotification: invalid ${label} ${JSON.stringify(id.slice(0, 80))}`);
}

export function assertValidSourceId(sourceId: string): void {
  assertValidId(sourceId, 'sourceId');
}

/**
 * Creates notifications/{type}_{sourceId} marked `source: 'server'`. Returns false (no write) if the
 * server already delivered that event, so retried or duplicated triggers are no-ops.
 *
 * Clients can create notifications/{anyId} (until the rules are tightened), so a document that exists
 * without `source: 'server'` was squatted by a client: it is replaced, not treated as a duplicate.
 * The rules forbid clients from setting `source`.
 */
export async function writeNotification(db: Firestore, input: NotificationInput): Promise<boolean> {
  assertValidSourceId(input.sourceId);
  if (!input.userId) throw new Error('writeNotification: userId is required');
  const id = `${input.type}_${input.sourceId}`;
  assertValidId(id, 'notification id');
  const extras: Record<string, string> = {};
  for (const key of EXTRA_KEYS) {
    const value = input.extras?.[key];
    if (typeof value === 'string') extras[key] = value;
  }
  const data = () => ({
    ...extras,
    userId: input.userId,
    type: input.type,
    message: input.message,
    read: false,
    source: 'server' as const,
    createdAt: FieldValue.serverTimestamp(),
  });
  const ref = db.collection('notifications').doc(id);
  try {
    await ref.create(data());
    return true;
  } catch (err) {
    if ((err as { code?: unknown }).code !== GRPC_ALREADY_EXISTS) throw err;
  }
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists && existing.get('source') === 'server') return false;
    tx.set(ref, data());
    return true;
  });
}
