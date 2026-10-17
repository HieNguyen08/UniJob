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
- **Second-confirmer completion** — `confirmCompletion` (`rating.service.ts`) sets `status: 'completed'` from the client; it only works when the poster confirms last (worker writes are denied). Move to server-side (slice 5).

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
