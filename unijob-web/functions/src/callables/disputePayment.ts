import { onCall } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { handleDisputePayment, type DisputePaymentResult } from '../handlers/disputes.js';
import { requireVerifiedMember } from '../lib/auth.js';

export type { DisputePaymentResult } from '../handlers/disputes.js';

export const disputePayment = onCall({ region: REGION }, (request): Promise<DisputePaymentResult> =>
  handleDisputePayment(db, requireVerifiedMember(request), request.data),
);
