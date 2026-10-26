/**
 * UniJob — recompute every profile's reputation fields and seed the job counter markers.
 *
 *   node scripts/recompute-reputation.mjs            # dry-run (default): prints the plan only
 *   node scripts/recompute-reputation.mjs --apply    # performs it
 *
 * Run once after the slice 6 functions AND the 6b rules are deployed (functions/README.md, "Deploying functions"):
 * 1. For every users/{uid}: ratingAverage, totalRatings, ratingScore (rating average minus 0.1 per penalty point),
 *    penaltyPoints (kept when valid, else 0), activeJobCount and completedJobs (from the jobs). Only docs whose
 *    values differ are written. Ratings for users without a profile are ignored; no profile is created.
 * 2. Writes jobCounters/{jobId} for every in-progress or completed job with a valid worker whose stored marker
 *    differs, so the onJobCounters trigger later reconciles against the backfilled counts.
 * Only ratings whose doc id is `${jobId}_${fromUserId}_${toUserId}` with a valid type and score count; the number
 * excluded is printed.
 *
 * Run it in a quiet window (nobody rating, assigning or completing jobs), review the dry-run, run --apply, then
 * run the dry-run AGAIN: it must plan nothing (users=0 markers=0). Anything left means data moved meanwhile.
 *
 * Uses the Admin SDK with scripts/service-account.json (gitignored; same as seed.mjs).
 * Named database: kirigitejkf8095h. Never commit a service-account file.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunk, planReputation } from './recompute-reputation-plan.ts';

const apply = process.argv.includes('--apply');

const SA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'service-account.json');
if (!existsSync(SA_PATH)) {
  console.error('scripts/service-account.json không tìm thấy (xem hướng dẫn trong scripts/seed.mjs).');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(SA_PATH, 'utf8'))) });
const db = getFirestore('kirigitejkf8095h');

const [userSnap, ratingSnap, jobSnap, markerSnap] = await Promise.all([
  db.collection('users').get(),
  db.collection('ratings').get(),
  db.collection('jobs').get(),
  db.collection('jobCounters').get(),
]);
const users = userSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
const ratings = ratingSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
const existingMarkers = markerSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
const jobs = jobSnap.docs.map((d) => {
  const j = d.data();
  return { id: d.id, status: j.status, postedBy: j.postedBy, assignedTo: j.assignedTo };
});
const plan = planReputation(users, ratings, jobs, existingMarkers);

console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${users.length} users, ${ratings.length} ratings, ${jobs.length} jobs`);
// Everything read from Firestore is untrusted: print it with JSON.stringify.
for (const u of plan.userUpdates) {
  for (const [field, value] of Object.entries(u.set)) {
    if (u.before[field] === value) continue;
    const old = field in u.invalidBefore ? `invalid ${JSON.stringify(u.invalidBefore[field])}` : (u.before[field] ?? '(none)');
    console.log(`  users/${JSON.stringify(u.uid)}: ${field} ${old} -> ${value}`);
  }
}
for (const m of plan.markers) {
  console.log(`  jobCounters/${JSON.stringify(m.jobId)}: active=${JSON.stringify(m.activeWorker)} completed=${JSON.stringify(m.completedWorker)}`);
}
console.log(`Excluded ratings (not counted): ${plan.excludedRatings}`);
console.log(`Summary: users=${plan.userUpdates.length} markers=${plan.markers.length}`);

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to write.');
  process.exit(0);
}

const writes = [
  ...plan.userUpdates.map((u) => (b) => b.update(db.collection('users').doc(u.uid), u.set)),
  ...plan.markers.map(({ jobId, ...marker }) => (b) =>
    b.set(db.collection('jobCounters').doc(jobId), { ...marker, updatedAt: FieldValue.serverTimestamp() })),
];
for (const part of chunk(writes, 400)) {
  const batch = db.batch();
  part.forEach((write) => write(batch));
  await batch.commit();
}
console.log(`Done: ${writes.length} writes.`);
