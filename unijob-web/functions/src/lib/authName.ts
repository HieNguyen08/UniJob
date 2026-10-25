import type { Auth, UserRecord } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

/** Sender name of `uid` for a server-signed notification, or '' when none can be trusted. Never throws. */
export type AuthNameOf = (uid: string) => Promise<string>;

const HCMUT_EMAIL = /^([^@\s]+)@hcmut\.edu\.vn$/i;

const isHcmut = (email: unknown): email is string => typeof email === 'string' && HCMUT_EMAIL.test(email);

/**
 * Sender names in server-signed notifications must not be user-chosen. Not trusted: the Firestore
 * fields applications.applicantName, jobs.postedByName and users/{uid}.displayName, the top-level
 * Auth displayName (the client can change it with updateProfile), and the Google name of a
 * personal account (anyone can name a Google account anything).
 * Used, in order, only for a verified @hcmut.edu.vn account:
 * 1. the Google provider's displayName, when that provider entry carries the same HCMUT email
 *    (the name comes from the university's Google Workspace directory);
 * 2. the local part of the verified HCMUT email;
 * else '' (the caller uses its fallback label).
 */
export function nameFromUserRecord(user: Pick<UserRecord, 'providerData' | 'email' | 'emailVerified'>): string {
  if (user.emailVerified !== true || !isHcmut(user.email)) return '';
  const email = user.email.toLowerCase();
  const google = user.providerData?.find((p) => p.providerId === 'google.com');
  if (google && isHcmut(google.email) && google.email.toLowerCase() === email && typeof google.displayName === 'string') {
    const name = google.displayName.trim();
    if (name) return name;
  }
  return HCMUT_EMAIL.exec(user.email)?.[1] ?? '';
}

/** Auth failures return '' so the caller falls back to a generic label instead of dropping the notification. */
export function makeAuthNameOf(auth: Pick<Auth, 'getUser'>): AuthNameOf {
  return async (uid) => {
    try {
      return nameFromUserRecord(await auth.getUser(uid));
    } catch (err) {
      logger.warn('authNameOf: user not readable, using the fallback label', { uid, code: (err as { code?: unknown }).code });
      return '';
    }
  };
}
