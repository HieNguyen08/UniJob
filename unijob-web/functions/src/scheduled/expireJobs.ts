import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { expireOverdueJobs } from '../handlers/expireJobs.js';

export const expireJobs = onSchedule(
  // 200 x 10 jobs, each one update plus at most one notification, fits well inside 540 s.
  { schedule: 'every 30 minutes', timeZone: 'Asia/Ho_Chi_Minh', region: REGION, timeoutSeconds: 540 },
  async () => {
    const result = await expireOverdueJobs(db, Timestamp.now(), { pageSize: 200, maxPages: 10 });
    // skipped: changed or failed, retried next run; more: page limit hit, the rest is left for the next run.
    logger.info('expireJobs done', result);
  },
);
