# Open security holes (fix in sub-project B)

Firestore/Storage holes found while building the agent pipeline. Fix them in sub-project B, server-side where the rules say so (Cloud Functions / Admin SDK).

## Pinned by `it.fails('KNOWN HOLE …')` in `unijob-web/tests/rules/firestore.rules.test.ts`

1. The payee cannot release escrow to themselves (`the payee cannot release escrow to themselves`).
2. Clients cannot create payments for other people (`clients cannot create payments for other people`).
3. Outsiders cannot confirm a completion (`outsiders cannot confirm a completion`).
4. Users cannot create notifications for other users (`users cannot create notifications for other users`).
5. Poster cannot mark a job completed directly (`poster cannot mark a job completed directly`, slice 5).
6. Poster cannot set `paymentStatus` directly (`poster cannot set paymentStatus directly`, slice 4).
7. A poster-fabricated completion cannot unlock rating (`a poster-fabricated completion cannot unlock rating`, slice 5). Ratings are only partially mitigated until slice 5: the poster can set `status: 'completed'` themselves.

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

## Before deploying these rules

Run the data migration first, otherwise legacy data is locked out (random-id applications cannot be assigned; jobs missing `applicants` cannot be applied to):

```
cd unijob-web
node scripts/migrate-applications.mjs           # dry-run: prints the plan
node scripts/migrate-applications.mjs --apply   # re-keys applications to {jobId}_{uid}, backfills jobs.applicants
```

It needs `unijob-web/scripts/service-account.json` (gitignored, same as `seed.mjs`) and targets database `kirigitejkf8095h`. Review the dry-run output before `--apply`.

Run it in a maintenance window (no one applying or accepting). New deterministic docs are written with `create()`, so a doc that appears after the snapshot makes the batch fail instead of being overwritten; a failed batch means "re-run". Legacy docs that conflict with an existing deterministic doc, fail validation, or are `accepted` without being in the job's `assignedTo` are listed as CONFLICT / INVALID and left untouched for manual review. The last line prints counts: migrated / conflicts / invalid / backfilled jobs.
