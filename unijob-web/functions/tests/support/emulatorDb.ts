import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { AuthNameOf } from '../../src/lib/authName.js';
import { assertAppProject, assertEmulatorEnv } from './emulator.js';

/** Admin db on the local emulator, only after the guards pass. Import src/admin.js nowhere else in emulator tests. */
export async function connectEmulatorDb(): Promise<{ app: App; db: Firestore }> {
  assertEmulatorEnv();
  if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { app, db } = await import('../../src/admin.js');
  assertAppProject(app);
  return { app, db };
}

/** Admin Auth on the local Auth emulator (FIREBASE_AUTH_EMULATOR_HOST required) plus the real authNameOf. */
export async function connectEmulatorAuth(): Promise<{ db: Firestore; auth: Auth; authNameOf: AuthNameOf }> {
  assertEmulatorEnv(process.env, { auth: true });
  const { app, db } = await connectEmulatorDb();
  const { authNameOf } = await import('../../src/admin.js');
  return { db, auth: getAuth(app), authNameOf };
}

/**
 * An Auth emulator user signed in with a verified HCMUT Google account: `googleName` is the provider
 * name (trusted), `displayName` the client-writable top-level name (a spoof, to prove it is ignored).
 */
export async function createGoogleUser(auth: Auth, uid: string, googleName: string, displayName = 'Mạo danh'): Promise<void> {
  const email = `${uid}@hcmut.edu.vn`;
  const result = await auth.importUsers([
    { uid, email, emailVerified: true, displayName, providerData: [{ uid: `g-${uid}`, providerId: 'google.com', displayName: googleName, email }] },
  ]);
  if (result.failureCount > 0) throw new Error(`createGoogleUser failed: ${result.errors[0]?.error.message}`);
}

export async function notificationsFor(db: Firestore, userId: string): Promise<QueryDocumentSnapshot[]> {
  return (await db.collection('notifications').where('userId', '==', userId).get()).docs;
}
