# Open security holes (fix in sub-project B)

Firestore/Storage holes found while building the agent pipeline. Fix them in sub-project B, server-side where the rules say so (Cloud Functions / Admin SDK).

## Pinned by `it.fails('KNOWN HOLE …')` in `unijob-web/tests/rules/firestore.rules.test.ts`

1. The payee cannot release escrow to themselves (`the payee cannot release escrow to themselves`).
2. Clients cannot create payments for other people (`clients cannot create payments for other people`).
3. Outsiders cannot confirm a completion (`outsiders cannot confirm a completion`).
4. Users cannot create notifications for other users (`users cannot create notifications for other users`).
5. Poster cannot mark a job completed directly (`poster cannot mark a job completed directly`, slice 5). Narrowed: the rules now only allow `in-progress -> completed` (no `open -> completed`, no way back to `open`), but that transition is still client-written.
6. Poster cannot set `paymentStatus` directly (`poster cannot set paymentStatus directly`, slice 4).
7. A poster-fabricated completion cannot unlock rating (`a poster-fabricated completion cannot unlock rating`, slice 5). Ratings are only partially mitigated until slice 5: the poster can still accept someone and then set `status: 'completed'` themselves.
8. Poster cannot cancel an in-progress job while escrow is held (`poster cannot cancel an in-progress job while escrow is held`, slice 6). `in-progress -> cancelled` stays allowed so paid jobs can still be cancelled, but it is a direct client write: the poster penalty in `posterCancelJob` can be skipped by writing the status directly, and the held escrow is neither refunded nor released server-side.

When you fix one, turn its `it.fails` into a normal `it` **and** add a sanity `assertSucceeds` for the allowed case in the same setup, so a broken fixture (which also makes the call fail) cannot make the test pass.

## Not yet pinned by tests

Add a failing (`it.fails('KNOWN HOLE …')`) test for each before fixing it.

- **payments.update** — the payer can set any `status` and `amount`.
- **workHistory.create** — open to any signed-in user (forged work history).
- **users read** — every signed-in user can read every profile (PII exposure).
- **Client-side notifications to other users** — created from `job.service.ts`, `cancel.service.ts`, `cleanup.service.ts` and `CreateJob.tsx`. These must move to Cloud Functions.
- **No `storage.rules`** — Firebase Storage has no rules file in the repo.
- **Legacy job docs without an `applicants` field** — non-poster applies are rejected (the jobs rule errors on a missing field). Needs a data check/migration before deploy.
- **Legacy applications with random ids** — cannot be assigned (the jobs rule looks up `applications/{jobId}_{uid}`). Migrate them to `{jobId}_{uid}` ids before deploy.
- **Worker cancel** — `workerCancelJob` (`cancel.service.ts`) is denied by the rules (the worker is not the poster, and `in-progress -> open` is no longer allowed for anyone). Needs a server-side flow (later slice).
- **Job invite spam** — `sendJobInvite` allows one invite per (job, worker) but has no per-poster rate limit across many jobs or workers. Still missing: a per-poster rate limit and a daily invite cap (e.g. a server-side counter doc per poster per day, checked in the callable).
- **jobs.create poster identity** — clients set `postedByName` / `postedByPhoto` freely, so a poster can impersonate anyone (e.g. "Phòng Đào tạo HCMUT") on the job card. Server notifications no longer trust `postedByName` (sender names come from the Google provider record of a verified HCMUT account, see `functions/src/lib/authName.ts`, or 'Ẩn danh'), but the rules should bind both fields to the poster's profile (or `'Ẩn danh'` / `''` when `isAnonymous`). Later slice.
- **HCMUT domain not enforced server-side** — any Google account can sign in; the client checks the `@hcmut.edu.vn` domain only in the UI. Add a `beforeUserCreated` / `beforeUserSignedIn` blocking function that rejects accounts without a verified `@hcmut.edu.vn` email. Notification sender names already ignore non-HCMUT accounts. Later slice.
- **Second-confirmer completion** — `confirmCompletion` (`rating.service.ts`) sets `status: 'completed'` from the client; it only works when the poster confirms last (worker writes are denied). Move to server-side (slice 5).

## Before the first money/reputation callable

- `requireVerifiedMember`: the caller must have `email_verified`, an `@hcmut.edu.vn` address and not be an anonymous user. `requireAuth` only checks that a uid exists.
- Decide on App Check (`enforceAppCheck` on callables) before shipping callables that move money or change reputation.
- Notification ids: server notifications are written to `notifications/{type}_{sourceId}` with `source: 'server'`. While clients can still create notifications (until slice 3), `writeNotification` replaces any document at that id that lacks `source: 'server'`.

## Before deploying these rules

Run the data migration first, otherwise legacy data is locked out (random-id applications cannot be assigned; jobs missing `applicants` cannot be applied to):

```
cd unijob-web
node scripts/migrate-applications.mjs           # dry-run: prints the plan
node scripts/migrate-applications.mjs --apply   # re-keys applications to {jobId}_{uid}, backfills jobs.applicants
node scripts/migrate-applications.mjs --apply --force-with-report   # only after reviewing every CONFLICT / INVALID line
```

`--apply` refuses to run (exit code 1) while the plan has any CONFLICT or INVALID entry. Review and resolve them first; `--force-with-report` migrates everything else and leaves those docs untouched.

It needs `unijob-web/scripts/service-account.json` (gitignored, same as `seed.mjs`) and targets database `kirigitejkf8095h`. Review the dry-run output before `--apply`.

Run it in a maintenance window (no one applying or accepting). New deterministic docs are written with `create()`, so a doc that appears after the snapshot makes the batch fail instead of being overwritten; a failed batch means "re-run". Migrated docs are rebuilt from the `applications.create` allowlist (other keys dropped) and must pass the same field checks (`applicantName` ≤100, `applicantPhoto` `''` or `https://` ≤2048, `message` ≤1000, `createdAt` a Firestore Timestamp, `updatedAt` a Timestamp when present). Legacy docs that conflict with an existing deterministic doc, fail validation, were written by the job poster, or are `accepted` without being in the job's `assignedTo` are listed as CONFLICT / INVALID and left untouched for manual review. Already-canonical docs that fail validation (including the jobId/uid id checks), and docs whose id has the `{jobId}_{uid}` shape of an existing job without matching their own data, are listed as INVALID, never modified, not used for the `applicants` backfill, and block legacy docs from migrating onto that id. At most 200 uids are added to one job's `applicants`; the rest are listed as CONFLICT. The last line prints counts: migrated / conflicts / invalid / backfilled jobs.
