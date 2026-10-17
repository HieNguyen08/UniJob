import { onCall } from 'firebase-functions/v2/https';
import { REGION } from './config.js';
import { requireAuth } from './lib/auth.js';

export interface PingResult {
  ok: true;
  uid: string;
  region: string;
}

/** Wiring check: proves deploy, region and auth. No data access. */
export const ping = onCall({ region: REGION }, (request): PingResult => ({ ok: true, uid: requireAuth(request), region: REGION }));
