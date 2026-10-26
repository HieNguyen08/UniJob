import { onCall } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { handleCancelJob, type CancelJobResult } from '../handlers/cancelJob.js';
import { requireVerifiedMember } from '../lib/auth.js';

export type { CancelJobResult } from '../handlers/cancelJob.js';

/** `{ jobId, reason? }` -> `{ penaltyPoints, status }`. The poster or the assigned worker cancels the job. */
export const cancelJob = onCall({ region: REGION }, (request): Promise<CancelJobResult> =>
  handleCancelJob(db, requireVerifiedMember(request), request.data),
);
