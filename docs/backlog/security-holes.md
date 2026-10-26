# Open security holes (fix in sub-project B)

Firestore/Storage holes found while building the agent pipeline. Fix them in sub-project B, server-side where the rules say so (Cloud Functions / Admin SDK).

## Pinned by `it.fails('KNOWN HOLE …')` in `unijob-web/tests/rules/firestore.rules.test.ts`

None open.

When you fix one, turn its `it.fails` into a normal `it` **and** add a sanity `assertSucceeds` for the allowed case in the same setup, so a broken fixture (which also makes the call fail) cannot make the test pass.

## Not yet pinned by tests

Add a failing (`it.fails('KNOWN HOLE …')`) test for each before fixing it.

- **users read** — every signed-in user can read every profile (PII exposure).
- **workHistory read** — every signed-in user can read every `workHistory` doc (the collaboration graph, which de-anonymises anonymous posters). Track and fix together with **users read**.
- **No `storage.rules`** — Firebase Storage has no rules file in the repo.
- **Legacy job docs without an `applicants` field** — non-poster applies are rejected (the jobs rule errors on a missing field). Needs a data check/migration before deploy.
- **Legacy applications with random ids** — cannot be assigned (the jobs rule looks up `applications/{jobId}_{uid}`). Migrate them to `{jobId}_{uid}` ids before deploy.
- **Job invite spam** — `sendJobInvite` allows one invite per (job, worker) but has no per-poster rate limit across many jobs or workers. Still missing: a per-poster rate limit and a daily invite cap (e.g. a server-side counter doc per poster per day, checked in the callable).
- **jobs.create poster identity** — clients set `postedByName` / `postedByPhoto` freely, so a poster can impersonate anyone (e.g. "Phòng Đào tạo HCMUT") on the job card. Server notifications no longer trust `postedByName` (sender names come from the Google provider record of a verified HCMUT account, see `functions/src/lib/authName.ts`, or 'Ẩn danh'), but the rules should bind both fields to the poster's profile (or `'Ẩn danh'` / `''` when `isAnonymous`). Later slice.
- **HCMUT domain not enforced server-side** — any Google account can sign in; the client checks the `@hcmut.edu.vn` domain only in the UI. Add a `beforeUserCreated` / `beforeUserSignedIn` blocking function that rejects accounts without a verified `@hcmut.edu.vn` email. Notification sender names already ignore non-HCMUT accounts. Later slice.
- **sendJobInvite rate limit** — one invite per worker per job, but no cap on invites per poster across jobs.
- **Escrow triggers do not check HCMUT membership** — `onJobEscrow` holds and releases for any poster/payee uid; verified-HCMUT membership is enforced only on `disputePayment` (`requireVerifiedMember`). Tracked with the `beforeUserCreated` item above.
- **No dispute resolution path** — a `disputed` escrow stays frozen: nothing (admin callable or otherwise) moves it to `released` or `refunded` yet.
- **cancelJob needs HCMUT accounts** — `requireVerifiedMember`; track with the `beforeUserCreated` item above.
- **Completion needs HCMUT accounts on both sides** — `confirmCompletion` uses `requireVerifiedMember`, so a job with a non-HCMUT poster or worker can never complete. Track with the `beforeUserCreated` item above.
- **Pre-deploy audit of `source: 'server'` payments** — before the slice 4 functions deploy, list and delete every `payments` doc with `source == 'server'` (clients could forge them under the old rules; the 4b rules close this).
- **users identity fields** — owners can still set `email` freely when creating their profile and rewrite `displayName` and `photoURL` afterwards (since slice 6 `users` writes use a key allowlist; `email` is no longer updatable). Bind `email` to the auth token and track with the users PII split (next spec).
- **maxJobLimit is not maintained** — locked at 2 for every user since slice 6 and not enforced anywhere (`canAcceptMoreJobs` has no caller). Decide server-side limits with the gamification spec.
- **Server profile stubs** — when a rating or cancel touches a user without a `users` doc, 6a writes a server stub (`uid` + server fields). The client sign-in skips creating a profile when the doc exists, so that user's doc lacks `displayName`/`email`/`photoURL` until they edit the profile (and the first-sign-in payload is never written). Resolved in slice 6b review: 6a marks stubs `stub: true` and `signInWithGoogle` completes them once (rules `stubCompletionOk`).
- **Legacy ratings on old completed jobs** — ratings created for jobs the client completed under the old rules (no server work history) stay in `ratings`, and since 6b the rules refuse new ones. The server aggregate counts only canonical, de-duplicated ratings; review the ratings the backfill excludes (see its output) before deleting or keeping them.

## Before the first money/reputation callable

- `requireVerifiedMember` (`functions/src/lib/auth.ts`, slice 4a): verified `@hcmut.edu.vn` email, not anonymous. Used by `disputePayment`; use it for every money/reputation callable.
- App Check is **not** enforced on `disputePayment` (decided in slice 4a: the web client has no App Check and the escrow is a ledger record only). It must be enabled (client + `enforceAppCheck: true`) before any real payment provider integration.
- Notification ids: server notifications are written to `notifications/{type}_{sourceId}` with `source: 'server'`. Clients cannot create notifications since slice 3; `writeNotification` still replaces a legacy client document at the same id that lacks `source: 'server'`.

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

**Legacy job completions.** Completions now live at `jobCompletions/{jobId}` (one per job) and `getJobCompletion` reads that id with a `get` (list is denied). Legacy completion docs with a random id are invisible to the client and can no longer be updated by it (the rules require `jobId == completionId`). Before deploying, either migrate each in-progress job's legacy completion to `jobCompletions/{jobId}` (keeping `workerConfirmed` / `posterConfirmed` / `status` / `completedAt`; if a job has several, keep the most advanced one and list the rest for review) or accept that those jobs restart the two-step confirmation. Completed jobs need no migration. `scripts/migrate-applications.mjs` does not handle completions yet. Since slice 5 the server (and `getJobCompletion`) treats any `jobCompletions` doc without `source: 'server'` and `serverVersion: 'completion-v1'` (and `jobId` equal to its id) as absent, including a legacy doc already at `jobCompletions/{jobId}`. The worker must report again ("Báo cáo hoàn thành"), which overwrites that doc; until then the poster sees the waiting state and cannot confirm. Random-id completions stay ignored. Review the jobs the poster marked `completed` directly under the old rules (no server completion, no work history, and the escrow trigger may not have matched what both parties agreed) before deploying.

**Legacy work history.** `workHistory` docs without `source: 'server'` and `serverVersion: 'completion-v1'` (random ids from before slice 5, or forged under the old create rule) are ignored by the client from now on (`getWorkHistory`, `haveWorkedTogether`, `getSmartMatchedWorkers`). They are never rewritten; delete them if you want a clean collection.

**Legacy payments.** Before slice 4 the client created payments with random ids (`addDoc`), and could release them itself. Since slice 4 the server only creates, releases and disputes `payments/{jobId}_{payeeId}`. Legacy random-id payments stay readable for payer and payee (`getPaymentForJob` falls back to `where('jobId')` + `where('payerId'|'payeeId')`), but they are never released, refunded or disputable server-side. Before deploying, list every `payments` doc whose id is not `{jobId}_{payeeId}` (and those created between the functions deploy and the hosting deploy, when old tabs could still create them) for manual review. A job may then have both a legacy and a server payment; the client shows the server one.

**Legacy reputation.** Before slice 6 owners could write any field of their own profile, so stored `ratingScore`, `totalRatings`, `activeJobCount` and `maxJobLimit` may be forged, and the rating trigger only recomputes a user on their next rating. The backfill below fixes the reputation fields and counters; review users whose stored values differ, and reset `maxJobLimit` to 2 if needed.

**Reputation backfill.** After the 6b rules are live, run `node scripts/recompute-reputation.mjs` (dry-run) in a quiet window (nobody rating, assigning or completing jobs), then `--apply`, then a second dry-run that must plan nothing. It fixes profile values forged under the old `users.update` rule and writes `jobCounters` markers for in-progress and completed jobs. It cannot recover cancel penalties lowered between the 6a and 6b deploys.
