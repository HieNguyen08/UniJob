import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleCompletionWritten } from '../handlers/completions.js';

export const onJobCompletionWritten = onDocumentWritten(
  { document: 'jobCompletions/{completionId}', database: DATABASE_ID, region: REGION },
  async (event) => {
    await handleCompletionWritten(db, event.params.completionId, event.data?.before.data(), event.data?.after.data());
  },
);
