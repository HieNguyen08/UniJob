import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleJobCounters } from '../handlers/counters.js';
import { eventTooOld } from '../lib/events.js';

/**
 * Keeps activeJobCount / completedJobs in step with the job. Retried: skips return, unexpected errors throw and
 * Cloud Functions retries. Events older than 24 hours are logged and dropped.
 */
export const onJobCounters = onDocumentUpdated(
  { document: 'jobs/{jobId}', database: DATABASE_ID, region: REGION, retry: true },
  async (event) => {
    const { jobId } = event.params;
    if (eventTooOld(event.time)) {
      logger.error('onJobCounters: event too old, dropped', { jobId, time: event.time });
      return;
    }
    await handleJobCounters(db, jobId, event.data?.before.data(), event.data?.after.data());
  },
);
