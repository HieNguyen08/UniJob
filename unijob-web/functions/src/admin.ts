import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DATABASE_ID } from './config.js';

export { DATABASE_ID, REGION } from './config.js';

/** The one Admin app. Reused if already initialised (module reloads, tests). */
export const app: App = getApps()[0] ?? initializeApp();
/** Admin Firestore bound to the named database. Bypasses security rules: validate inputs first. */
export const db: Firestore = getFirestore(app, DATABASE_ID);
