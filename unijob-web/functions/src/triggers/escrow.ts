import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleEscrow } from '../handlers/payments.js';
import { eventTooOld } from '../lib/events.js';

/**
 * Escrow hold (open -> in-progress) and release (-> completed). Separate from onJobUpdated so it can be
 * retried: skips return, unexpected errors throw and Cloud Functions retries. Events older than 24 hours
 * are logged and dropped so a permanent failure does not retry forever.
 */
export const onJobEscrow = onDocumentUpdated(
  { document: 'jobs/{jobId}', database: DATABASE_ID, region: REGION, retry: true },
  async (event) => {
    const { jobId } = event.params;
    if (eventTooOld(event.time)) {
      logger.error('onJobEscrow: event too old, dropped', { jobId, time: event.time });
      return;
    }
    await handleEscrow(db, jobId, event.data?.before.data(), event.data?.after.data());
  },
);
