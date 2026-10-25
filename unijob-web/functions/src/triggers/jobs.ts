import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleJobUpdated } from '../handlers/jobs.js';

export const onJobUpdated = onDocumentUpdated(
  { document: 'jobs/{jobId}', database: DATABASE_ID, region: REGION },
  async (event) => {
    await handleJobUpdated(db, event.params.jobId, event.data?.before.data(), event.data?.after.data());
  },
);
