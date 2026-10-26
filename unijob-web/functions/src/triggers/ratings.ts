import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleRatingCreated } from '../handlers/ratings.js';
import { eventTooOld } from '../lib/events.js';

/**
 * Recomputes the rated user's reputation fields when a rating is created. Retried: skips return, unexpected
 * errors throw and Cloud Functions retries. Events older than 24 hours are logged and dropped.
 */
export const onRatingCreated = onDocumentCreated(
  { document: 'ratings/{ratingId}', database: DATABASE_ID, region: REGION, retry: true },
  async (event) => {
    const { ratingId } = event.params;
    if (eventTooOld(event.time)) {
      logger.error('onRatingCreated: event too old, dropped', { ratingId, time: event.time });
      return;
    }
    await handleRatingCreated(db, ratingId, event.data?.data());
  },
);
