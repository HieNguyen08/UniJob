---
title: UniJob security hardening (sub-project B, part 1)
status: approved
approved: 2026-10-10 by HieNguyen08 in chat ("tiếp tục … tự phân rã task, tự đẩy … có thể stack PR"), priority chosen at gate 3 of PR #19: "Vá bảo mật rules"
date: 2026-10-10
owner: HieNguyen08
---

# UniJob security hardening

## 1. Context and goal

`docs/backlog/security-holes.md` lists 6 Firestore holes pinned by `it.fails('KNOWN HOLE …')` tests and 10 more that are not yet pinned. Today the client writes everything: payments, escrow release, job completion, work history, rating aggregates, reputation penalties and notifications for other users (`job.service.ts`, `payment.service.ts`, `rating.service.ts`, `cancel.service.ts`, `cleanup.service.ts`).

Several of those writes already **fail in production** because the rules deny them:
- `submitRating` updates the rated user's profile (`users` update is owner-only), so ratings are saved but `ratingScore`/`totalRatings` never change.
- `workerCancelJob` calls `updateApplicationStatus` and `updateJob(status: 'open')` as the worker, which the rules deny.
- When the worker is the last to confirm a completion, `releasePayment` → `updateJob(paymentStatus)` and `updateJob(status: 'completed')` run as the worker and are denied.

Goal: every trusted write (money, escrow, completion, work history, reputation, notifications to other users) happens server-side with the Admin SDK in Cloud Functions, and the rules allow clients only what a client may legitimately do. Success = every `KNOWN HOLE` test is flipped to a normal passing test, every hole in the backlog has a test, and the broken flows above work.

## 2. Decisions

| Topic | Decision |
|---|---|
| Server runtime | Cloud Functions for Firebase v2, TypeScript, Node 22, region `asia-southeast1`, in `unijob-web/functions/` |
| Firestore database | Named database `kirigitejkf8095h`; triggers and Admin SDK must target it explicitly |
| Client → server calls | Callable functions (`onCall`) for user actions (confirm completion, cancel job, dispute); Firestore triggers for side effects (notifications, payment on accept, rating aggregate) |
| Idempotency | Deterministic document ids for side-effect docs (`payments/{jobId}_{payeeId}`, notifications keyed by event) and transactions for state changes |
| Testing | Rules tests on the Firestore emulator (existing); functions tested with `firebase-functions-test` + emulator, run by a new `functions-tests` gate in `ci-local --full` |
| Deploy | Out of scope for these PRs: they only add code and tests. Deploying Functions needs the Blaze plan and is done by the owner |
| Delivery | One small PR per slice, stacked; each PR green on `ci-local --full` |

## 3. Slices (one PR each, in order)

1. **`fix/rules-client-safe` — rules that need no server.**
   - `jobs.create`: `postedBy == request.auth.uid`, `status == 'open'`, empty `applicants`/`assignedTo`.
   - `jobs.update` by a non-poster: only `applicants` and `updatedAt` change, and `applicants` changes only by adding or removing the caller's own uid.
   - `jobs.delete`: poster only (add the missing test).
   - `applications.create`: `applicantId == auth.uid`, `status == 'pending'`, the job exists and the caller is not its poster.
   - `applications.update` by the poster: only `status` (to `accepted`/`rejected`) and `updatedAt`.
   - `notifications.update`: owner may change only `read` (to `true`).
   - `ratings.create`: id is `{jobId}_{fromUserId}_{toUserId}` (one rating per pair per job), `fromUserId == auth.uid`, `toUserId != fromUserId`, `score` is an integer 1–5, and caller and target are the job's poster and an assigned worker. `submitRating` switches to `setDoc` with that id.
   - Flips KNOWN HOLE 1 and 2.
2. **`feat/functions-scaffold`** — `unijob-web/functions/` (TS, ESLint, Vitest), emulator config, Admin SDK bound to the named database, shared helpers (auth/membership checks, notification writer), `ci-local` gates `functions-typecheck`, `functions-tests`, coverage include `functions/src/**`.
3. **`feat/server-notifications`** — triggers create notifications: new application → poster; application accepted/rejected → applicant; completion requested/confirmed → both; job cancelled → assigned workers. A scheduled function replaces `cleanup.service.ts` (expire open jobs past their deadline). Client stops creating notifications for others. Rule: a client may only create a notification for itself (or none). Flips KNOWN HOLE 6.
4. **`feat/server-escrow`** — trigger on application `status → accepted` creates `payments/{jobId}_{payeeId}` (amount from the job, fee from `fees.ts` logic) and sets `jobs.paymentStatus`. Callable `disputePayment`. Rules: clients cannot create or update payments. Flips KNOWN HOLE 3 and 4.
5. **`feat/server-completion`** — callable `confirmCompletion({jobId})`: checks the caller is the poster or the assigned worker, records their confirmation in a transaction; when both confirmed: completion `confirmed`, `workHistory` entry, job `completed`, payment `released`. Rules: clients cannot write `jobCompletions` or `workHistory`. Flips KNOWN HOLE 5.
6. **`feat/server-reputation`** — trigger on rating create recomputes `ratingScore`/`totalRatings`; callable `cancelJob({jobId, reason})` for worker and poster (penalties, application/job status, refund held payment, notifications). `users.update` forbids client writes to `ratingScore`, `totalRatings`, `activeJobCount`, `xp`, `level`, `badges`, `role`, `completedJobs`.
7. **`feat/storage-rules`** — `storage.rules` (owner-only paths, content-type and size limits matching `storage.service.ts`), tests on the Storage emulator, `firebase.json` + rules gate.

Out of scope here (next spec): users PII split (public profile vs private fields), gamification XP server-side, admin role.

## 4. Error handling

Callables throw `HttpsError` with Vietnamese messages for user-facing errors (`unauthenticated`, `permission-denied`, `failed-precondition`, `not-found`). Triggers log and never throw on duplicate events (idempotent ids). The client shows the callable's message in the existing toast.

## 5. Testing

- Every rule change: allow + deny tests in `unijob-web/tests/rules/`; flipping a KNOWN HOLE adds a sanity `assertSucceeds` for the allowed case in the same setup.
- Every function: unit tests with the Admin SDK against the emulator, including idempotency (trigger delivered twice) and authorization denials.
- Changed client services keep or gain unit tests (coverage ≥ 70% for new/changed `src/services/**`).

## 6. Risks

| Risk | Mitigation |
|---|---|
| Rules tightened before the server path exists breaks a flow | Each slice moves the client to the server path in the same PR that tightens the rule |
| Functions not deployed when rules are deployed | PR bodies state deploy order: functions first, then rules |
| Named database in triggers | Helper binds `getFirestore(app, 'kirigitejkf8095h')` and triggers pass `database: 'kirigitejkf8095h'`; tests run against the emulator with the same id |
