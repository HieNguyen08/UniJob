/**
 * UniJob — Deadline Refresh Script  (Admin SDK version)
 * Run: node scripts/refresh-deadlines.mjs
 *
 * Prerequisites:
 *   1. Download a service account key from Firebase Console:
 *      Project Settings → Service Accounts → Generate new private key
 *   2. Save it as scripts/service-account.json  (already in .gitignore)
 *
 * Refresh rules:
 *   isUrgent jobs      → 2–10 h from now (random)
 *   in-progress jobs   → extends to at least 7 days (if already expired)
 *   open / cancelled   → 3–21 days from now (random)
 *   cancelled + no assignedTo → also resets status back to 'open'
 *   completed jobs     → skipped
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load service account ──────────────────────────────────────────────────────
const SA_PATH = resolve(__dirname, 'service-account.json');
if (!existsSync(SA_PATH)) {
  console.error(`
❌  scripts/service-account.json không tìm thấy.

👉  Làm theo các bước sau:
    1. Mở Firebase Console → Chọn project UniJob
    2. Vào Project Settings → Service Accounts
    3. Nhấn "Generate new private key" → Tải file JSON về
    4. Đặt tên lại thành service-account.json
    5. Đặt vào thư mục: unijob-web/scripts/
    6. Chạy lại: npm run refresh
`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf8'));

// ── Init Admin SDK ────────────────────────────────────────────────────────────
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore('kirigitejkf8095h'); // named DB

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = Date.now();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const hoursFromNow = (h) => Timestamp.fromDate(new Date(now + h * 3_600_000));
const daysFromNow  = (d) => Timestamp.fromDate(new Date(now + d * 86_400_000));
const THRESHOLD_MS = 24 * 3_600_000; // refresh jobs expiring within 24 h

function newDeadline(job) {
  if (job.isUrgent) {
    return hoursFromNow(rand(2, 10));
  }
  if (job.status === 'in-progress') {
    const millis = job.deadline?._seconds ? job.deadline._seconds * 1000 : 0;
    return millis > now + 7 * 86_400_000
      ? job.deadline                  // still plenty of time — leave it
      : daysFromNow(rand(7, 14));
  }
  return daysFromNow(rand(3, 21));
}

// ── Query ─────────────────────────────────────────────────────────────────────
const jobsCol = db.collection('jobs');
const cutoff  = Timestamp.fromDate(new Date(now + THRESHOLD_MS));

const snapshot = await jobsCol
  .where('status', 'in', ['open', 'in-progress', 'cancelled'])
  .where('deadline', '<=', cutoff)
  .get();

if (snapshot.empty) {
  console.log('✅ Tất cả công việc vẫn còn hạn — không cần làm mới.');
  process.exit(0);
}

console.log(`🔄 Đang làm mới ${snapshot.docs.length} công việc sắp/đã hết hạn...\n`);

// ── Batch update (max 500/batch) ──────────────────────────────────────────────
const CHUNK = 490;
let updated = 0;

for (let i = 0; i < snapshot.docs.length; i += CHUNK) {
  const batch = db.batch();
  const chunk = snapshot.docs.slice(i, i + CHUNK);

  for (const d of chunk) {
    const job = d.data();
    const ref  = jobsCol.doc(d.id);

    const updates = {
      deadline:  newDeadline(job),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Auto-expired jobs (cancelled + no assigned worker) → reopen
    if (job.status === 'cancelled' && (!job.assignedTo || job.assignedTo.length === 0)) {
      updates.status = 'open';
    }

    batch.update(ref, updates);
    updated++;

    const statusNote = updates.status ? ` ➜ status: ${updates.status}` : '';
    const deadline   = updates.deadline.toDate().toLocaleDateString('vi-VN');
    console.log(`  [${job.status}${statusNote}]  ${(job.title ?? d.id).slice(0, 52).padEnd(52)}  →  ${deadline}`);
  }

  await batch.commit();
}

console.log(`\n✅ Đã làm mới ${updated} công việc thành công.`);
process.exit(0);
