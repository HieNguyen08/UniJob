import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { authNameOf, db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleApplicationCreated, handleApplicationUpdated } from '../handlers/applications.js';

const opts = { document: 'applications/{appId}', database: DATABASE_ID, region: REGION } as const;

export const onApplicationCreated = onDocumentCreated(opts, async (event) => {
  await handleApplicationCreated(db, event.params.appId, event.data?.data(), authNameOf);
});

export const onApplicationUpdated = onDocumentUpdated(opts, async (event) => {
  await handleApplicationUpdated(db, event.params.appId, event.data?.before.data(), event.data?.after.data());
});
