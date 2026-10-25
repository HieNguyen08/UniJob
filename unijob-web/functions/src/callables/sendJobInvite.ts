import { onCall } from 'firebase-functions/v2/https';
import { authNameOf, db } from '../admin.js';
import { REGION } from '../config.js';
import { handleSendJobInvite, type SendJobInviteResult } from '../handlers/invites.js';
import { requireAuth } from '../lib/auth.js';

export type { SendJobInviteResult } from '../handlers/invites.js';

export const sendJobInvite = onCall({ region: REGION }, (request): Promise<SendJobInviteResult> =>
  handleSendJobInvite(db, requireAuth(request), request.data, authNameOf),
);
