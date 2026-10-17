/**
 * UniJob — migrate legacy applications before deploying the hardened rules.
 *
 *   node scripts/migrate-applications.mjs            # dry-run (default): prints the plan only
 *   node scripts/migrate-applications.mjs --apply    # performs it (refuses while CONFLICT/INVALID exist)
 *   node scripts/migrate-applications.mjs --apply --force-with-report
 *                                                    # performs it anyway, leaving CONFLICT/INVALID untouched
 *
 * 1. Re-keys every application whose id != `${jobId}_${applicantId}` to the deterministic id
 *    (skips the create if it already exists) and deletes the old doc. The copy is rebuilt from
 *    the applications.create allowlist and must pass the same field checks; applications by the
 *    job poster, or `accepted` ones whose uid is not in the job assignedTo, are left untouched
 *    and reported (INVALID / CONFLICT). Invalid canonical docs are reported, never modified.
 * 2. Backfills jobs.applicants with the applicant uids of pending and assigned accepted applications.
 *
 * Uses the Admin SDK with scripts/service-account.json (gitignored; same as seed.mjs).
 * Named database: kirigitejkf8095h. Never commit a service-account file.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBlockReason, planMigration } from './migrate-applications-plan.ts';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force-with-report');

const SA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'service-account.json');
if (!existsSync(SA_PATH)) {
  console.error('scripts/service-account.json không tìm thấy (xem hướng dẫn trong scripts/seed.mjs).');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(SA_PATH, 'utf8'))) });
const db = getFirestore('kirigitejkf8095h');

const [appSnap, jobSnap] = await Promise.all([db.collection('applications').get(), db.collection('jobs').get()]);
const apps = appSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
const jobs = jobSnap.docs.map((d) => {
  const j = d.data();
  return { id: d.id, postedBy: j.postedBy, applicants: j.applicants, assignedTo: j.assignedTo };
});
const plan = planMigration(apps, jobs, { isTimestamp: (v) => v instanceof Timestamp });

console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${apps.length} applications, ${jobs.length} jobs`);
for (const c of plan.creates) console.log(`  create applications/${c.id}`);
for (const id of plan.deletes) console.log(`  delete applications/${id}`);
for (const b of plan.backfills) console.log(`  jobs/${b.jobId}.applicants += ${b.add.join(', ')}`);
for (const id of plan.orphans) console.log(`  orphan (job missing): applications/${id}`);
for (const c of plan.conflicts) {
  console.log(`  CONFLICT (left untouched) applications/${c.id} [${c.legacyStatus}] vs ${c.target} [${c.targetStatus}]: ${c.reason}`);
}
for (const i of plan.invalid) console.log(`  INVALID (left untouched) applications/${i.id}: ${i.reason}`);
const summary = () =>
  `Summary: migrated=${plan.creates.length} conflicts=${plan.conflicts.length} invalid=${plan.invalid.length} backfilledJobs=${plan.backfills.length}`;

if (!apply) {
  console.log(summary());
  console.log('Dry-run only. Re-run with --apply to write.');
  process.exit(0);
}

const blocked = applyBlockReason(plan, force);
if (blocked) {
  console.log(summary());
  console.error(blocked);
  process.exit(1);
}

const ops = [
  ...plan.creates.map((c) => (b) => b.create(db.collection('applications').doc(c.id), c.data)),
  ...plan.backfills.map((x) => (b) =>
    b.update(db.collection('jobs').doc(x.jobId), {
      applicants: x.add.length ? FieldValue.arrayUnion(...x.add) : [],
    })),
  // create() fails if the doc appeared after the snapshot (nothing is overwritten; re-run).
  // deletes last so a failed run never loses a legacy doc without its copy
  ...plan.deletes.map((id) => (b) => b.delete(db.collection('applications').doc(id))),
];
for (let i = 0; i < ops.length; i += 400) {
  const batch = db.batch();
  ops.slice(i, i + 400).forEach((op) => op(batch));
  await batch.commit();
}
console.log(`Done: ${ops.length} operations.`);
console.log(summary());
