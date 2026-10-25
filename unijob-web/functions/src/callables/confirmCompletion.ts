import { onCall } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { handleConfirmCompletion } from '../handlers/confirmCompletion.js';
import { requireVerifiedMember } from '../lib/auth.js';
import type { ConfirmCompletionResult } from '../lib/completion.js';

export type { ConfirmCompletionResult } from '../lib/completion.js';

export const confirmCompletion = onCall({ region: REGION }, (request): Promise<ConfirmCompletionResult> =>
  handleConfirmCompletion(db, requireVerifiedMember(request), request.data),
);
