# Open security holes (fix in sub-project B)

Firestore/Storage holes found while building the agent pipeline. Fix them in sub-project B, server-side where the rules say so (Cloud Functions / Admin SDK).

## Pinned by `it.fails('KNOWN HOLE …')` in `unijob-web/tests/rules/firestore.rules.test.ts`

1. Job create must set `postedBy` to the caller (line 85).
2. A non-poster cannot remove other applicants (line 88).
3. The payee cannot release escrow to themselves (line 110).
4. Clients cannot create payments for other people (line 113).
5. Outsiders cannot confirm a completion (line 123).
6. Users cannot create notifications for other users (line 133).

When you fix one, turn its `it.fails` into a normal `it` **and** add a sanity `assertSucceeds` for the allowed case in the same setup, so a broken fixture (which also makes the call fail) cannot make the test pass.

## Not yet pinned by tests

Add a failing (`it.fails('KNOWN HOLE …')`) test for each before fixing it.

- **jobs.applicants padding** — the `applicants` array can be padded with arbitrary uids, not just the caller's own.
- **applications.create** — no status check, so an applicant can create an application already `accepted` (self-accept).
- **payments.update** — the payer can set any `status` and `amount`.
- **notifications.update** — the owner can change any field, not just mark it read.
- **workHistory.create** — open to any signed-in user (forged work history).
- **ratings.create** — no job-membership or uniqueness check (rate anyone, many times).
- **users read** — every signed-in user can read every profile (PII exposure).
- **jobs delete** — untested.
- **Client-side notifications to other users** — created from `job.service.ts`, `cancel.service.ts`, `cleanup.service.ts` and `CreateJob.tsx`. These must move to Cloud Functions.
- **No `storage.rules`** — Firebase Storage has no rules file in the repo.
