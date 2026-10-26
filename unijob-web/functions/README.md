# UniJob Cloud Functions

Cloud Functions for Firebase v2 (TypeScript, Node 22, region `asia-southeast1`). Every trusted write (money, escrow, completion, work history, reputation, notifications to other users) belongs here, not in the web client.

- `src/config.ts`: `REGION`, `DATABASE_ID` (`kirigitejkf8095h`).
- `src/admin.ts`: the Admin app and `db` bound to the named database. Firestore triggers must pass `database: DATABASE_ID`.
- `src/lib/`: shared helpers (`requireAuth`, `requireVerifiedMember`, `assertMember`, `writeNotification`, `calculatePlatformFee`, `eventTooOld`, the escrow rules in `payments.ts`, the completion rules in `completion.ts`, and the reputation, counter and cancel rules in `reputation.ts`, `counters.ts` and `cancel.ts`).
- `src/handlers/`: pure handlers `(db, ids, data)`; they never import `src/admin.ts`, so emulator tests can call them with the guarded emulator db.
- `src/triggers/`, `src/scheduled/`, `src/callables/`: thin v2 wrappers that bind a handler to an event and pass the Admin `db`.
- `tests/unit/`: Vitest, no emulator (`npm test`).
- `tests/emulator/`: Vitest against the Firestore and Auth emulators. Run from `unijob-web/` with `npm run test:functions` (needs Java ≥ 11). Project is always `demo-unijob`.
- Notification sender names come only from a verified `@hcmut.edu.vn` account: its Google provider name (when the provider email is the same HCMUT address), else the email's local part (`authNameOf`, `src/lib/authName.ts`). Never from client-writable names: `applicantName`, `postedByName`, `users/{uid}.displayName` or the top-level Auth `displayName` (`updateProfile`).

Install: `npm ci` here as well as in `unijob-web/`.

firebase-admin is pinned to 14.5.0 (firebase-functions 7.4.0 accepts ^14). `firebase-functions-test` is not used: tests call v2 callables through `fn.run(request)`; it only peers on firebase-admin ^13, so adding it back would force 13.x.

## Notifications (slice 3)

| Function | Event | Notification (recipient) |
|---|---|---|
| `onApplicationCreated` | `applications/{appId}` created | `new_application` (poster) |
| `onApplicationUpdated` | application `pending` -> `accepted`/`rejected` | `application_accepted` / `application_rejected` (applicant) |
| `onJobCompletionWritten` | worker confirmed, poster not yet | `completion_requested` (poster), one per job |
| `onJobUpdated` | job status -> `cancelled` / `completed` | `job_cancelled` (assigned workers) / `job_completed` (worker and poster) |
| `expireJobs` | every 30 min, Asia/Ho_Chi_Minh | cancels overdue open jobs, `deadline_expired` (poster) |
| `sendJobInvite` | callable `{ jobId, workerId }` -> `{ sent }` | `job_invite` (worker) |

## Escrow (slice 4)

| Function | Event | Effect |
|---|---|---|
| `onJobEscrow` (retried) | job `open` -> `in-progress` with exactly one assignee whose `applications/{jobId}_{payeeId}` is `accepted` | writes `payments/{jobId}_{payeeId}` as `held` and sets `jobs.paymentStatus: 'held'`; skips volunteer jobs, non-positive amounts and amounts above 100 000 000 |
| `onJobEscrow` (retried) | job status -> `completed` | moves the `held` payment to `released` (logs an error when a paid job completes without a matching server payment) |
| `disputePayment` | callable `{ jobId, reason }` -> `{ disputed: true }` | gated by `requireVerifiedMember`; freezes the held payment and sends `payment_disputed` to the other party |

Ledger only, no money moves. Cancellation refunds held escrow through `cancelJob` (slice 6); a refunded payment is held afresh if the same worker is assigned again. Only docs with `source: 'server'` that also match the job (jobId, payer = poster, payee = first assignee) are released or disputable; the payment record, not the editable `jobs.payment`, is the source of truth for the amount. An existing server record for the same parties is kept as is by a redelivered hold event; any other doc at the deterministic id is replaced. `onJobEscrow` is separate from the notification trigger `onJobUpdated` and has `retry: true`: skips return, unexpected errors throw and are retried; events older than 24 hours are logged (`logger.error`) and dropped.

## Completion (slice 5)

| Function | Event | Effect |
|---|---|---|
| `confirmCompletion` | callable `{ jobId }` -> `{ status, workerConfirmed, posterConfirmed }` | gated by `requireVerifiedMember` (both sides need a verified HCMUT account); the worker confirms first (creates `jobCompletions/{jobId}`), the poster second. Once both have confirmed: completion `confirmed`, job `completed`, `workHistory/{jobId}_{workerId}` is written |

One transaction. A repeat by the same side writes nothing, and a completed job is refused. The existing triggers do the rest: `onJobCompletionWritten` (`completion_requested`), `onJobUpdated` (`job_completed`), `onJobEscrow` (releases held escrow).

Trust marker: every completion record the callable writes carries `source: 'server'` and `serverVersion: 'completion-v1'`. A `jobCompletions` doc is trusted only when `source === 'server' && serverVersion === 'completion-v1' && jobId === <doc id>` (`isTrustedCompletion`, `src/lib/completion.ts`). Anything else (legacy, or forged: before the slice 3 rules clients could write any field, including `source`) is ignored as if absent: the poster is told the worker has not reported, and the worker reports again, which overwrites the doc with a fresh server record. The web client (5b) must apply the same filter in `getJobCompletion`. The `workHistory/{jobId}_{workerId}` record is always (re)written on completion, replacing whatever was at that id, and carries the same `source: 'server'` + `serverVersion: 'completion-v1'` pair: the client filters work history on both (pre-slice-5 forged docs at other ids may carry `source: 'server'`).

## Reputation and cancellation (slice 6)

| Function | Event | Effect |
|---|---|---|
| `onRatingCreated` | `ratings/{ratingId}` created (retried) | recomputes the rated user's `ratingAverage`, `totalRatings` and `ratingScore` from all of their valid ratings |
| `onJobCounters` | `jobs/{jobId}` updated (retried) | maintains `activeJobCount` and `completedJobs`, reconciled from the job's current state through the server-only marker `jobCounters/{jobId}` (idempotent under redelivery and out-of-order events) |
| `cancelJob` | callable `{ jobId, reason? }` -> `{ penaltyPoints, status }` | gated by `requireVerifiedMember`; the poster or the assigned worker cancels in one transaction |

Score: `ratingScore = round1(max(0, ratingAverage - 0.1 * penaltyPoints))`, so a rating recompute never erases penalties. A valid rating has `toUserId` = the user, a different `fromUserId`, a `type` of `poster-to-worker` or `worker-to-poster`, an integer `score` from 1 to 5 and a doc id exactly `{jobId}_{fromUserId}_{toUserId}` (counted once per key). Penalty tiers use the deadline day as the expiry scheduler does (`src/lib/deadline.ts`: end of the Vietnam day, none for a legacy no-deadline job).

Profile stubs: a profile that does not exist yet gets a server stub instead of being skipped, so a missing doc cannot launder a penalty or a counter. The stub is written with `set(..., { merge: true })` only when the doc does not exist, and holds `uid`, `stub: true` and the server fields (`penaltyPoints`, `ratingAverage`, `totalRatings`, `ratingScore`, `activeJobCount`, `completedJobs`), with no email or name. Contract with the web client (6b): sign-in completes a stub once (writes the profile fields and removes `stub`) instead of skipping creation; a real profile never carries `stub`.

Penalties: the poster cancelling an in-progress job with an assigned worker gets 5 points. The worker cancelling gets 20 points under 12 hours to the deadline (a passed deadline included), 10 under 24 hours, else 5. The poster can cancel `open` and `in-progress` jobs, the worker only `in-progress`; the worker must give one of the fixed reasons (logged, never stored). A held server payment is refunded (`refunded`, `jobs.paymentStatus: 'refunded'`). A worker cancel reopens the job (`assignedTo: []`, the worker leaves `applicants`), marks the application `rejected` with `withdrawnByWorker: true`, and sends `worker_cancelled` to the poster; a poster cancel sets `cancelledBy: 'poster'` and `cancelledAt`, and the existing `onJobUpdated` sends `job_cancelled` to the worker.

Denied with `failed-precondition`: after the worker reported completion (a trusted `jobCompletions` doc with `workerConfirmed`), and while the payment is `disputed`. An untrusted legacy completion doc does not block.

`scripts/recompute-reputation.mjs` (in `unijob-web/`) backfills every profile's reputation fields and the `jobCounters` markers (markers already equal to the job's state are skipped; it prints how many ratings it excluded). Run it in a quiet window (nobody rating, assigning or completing jobs), review the dry-run, `--apply`, then run the dry-run again: it must plan nothing.

## Deploying functions

- Deploying needs the Blaze (pay-as-you-go) plan on the Firebase project. The owner does this. PRs only add code and tests.
- From `unijob-web/`: `npx firebase deploy --only functions` (the predeploy step runs `npm run build`).
- Firestore triggers must be deployed in the database's location. Before the first deploy, check it with `gcloud firestore databases describe --database=kirigitejkf8095h` (field `locationId`). If it is not `asia-southeast1`, change `REGION` in `src/config.ts` to match (a multi-region database such as `nam5` needs a region inside it) and update the region assertions in the tests.
- When a PR moves a write server-side and tightens the rules, deploy the functions first, then the rules (`npx firebase deploy --only firestore:rules`). Otherwise the client loses the write before the server can make it.
- Slice 3 order, all in one deploy window: `npx firebase deploy --only firestore:indexes` (index `jobs(status, deadline)` for `expireJobs`; wait until it is built), then `--only functions`, then right after that `--only hosting,firestore:rules` from the 3b branch. Between the functions and hosting deploys users may see a duplicate notification (old client + server); never deploy the 3b rules before these functions, or notifications stop.
- Slice 4 order, one window: `--only firestore:rules` from the 4b branch FIRST (closes client payment writes; old tabs' `createPayment` just fails silently), then `--only functions` (4a), then `--only hosting` (4b). Before the functions deploy, list and delete any `payments` doc with `source == 'server'` (clients could forge them under the old rules).
- Slice 5 order, one window: `--only functions` (5a) FIRST, then `--only hosting,firestore:rules` from the 5b branch together. Deploying the 5b rules before these functions breaks completion for everyone.
- Before the slice 5 functions deploy, list and delete every `jobCompletions` and `workHistory` doc with `source == 'server'` (clients could forge them under the old rules; the server has never written either collection before slice 5).
- Slice 6 order, one window: `--only functions` (6a) FIRST, then `--only hosting,firestore:rules` from the 6b branch, then `cd unijob-web && node scripts/recompute-reputation.mjs` (dry-run, review the output), then `--apply`. Deploying the 6b rules before these functions breaks cancellation for everyone.
