# UniJob Cloud Functions

Cloud Functions for Firebase v2 (TypeScript, Node 22, region `asia-southeast1`). Every trusted write (money, escrow, completion, work history, reputation, notifications to other users) belongs here, not in the web client.

- `src/config.ts`: `REGION`, `DATABASE_ID` (`kirigitejkf8095h`).
- `src/admin.ts`: the Admin app and `db` bound to the named database. Firestore triggers must pass `database: DATABASE_ID`.
- `src/lib/`: shared helpers (`requireAuth`, `requireVerifiedMember`, `assertMember`, `writeNotification`, `calculatePlatformFee`, `eventTooOld`, and the escrow rules in `payments.ts`).
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

Ledger only, no money moves. Cancellation leaves escrow `held` until slice 6's `cancelJob` (KNOWN HOLE 6). Only docs with `source: 'server'` that also match the job (jobId, payer = poster, payee = first assignee) are released or disputable; the payment record, not the editable `jobs.payment`, is the source of truth for the amount. An existing server record for the same parties is kept as is by a redelivered hold event; any other doc at the deterministic id is replaced. `onJobEscrow` is separate from the notification trigger `onJobUpdated` and has `retry: true`: skips return, unexpected errors throw and are retried; events older than 24 hours are logged (`logger.error`) and dropped.

## Deploying functions

- Deploying needs the Blaze (pay-as-you-go) plan on the Firebase project. The owner does this. PRs only add code and tests.
- From `unijob-web/`: `npx firebase deploy --only functions` (the predeploy step runs `npm run build`).
- Firestore triggers must be deployed in the database's location. Before the first deploy, check it with `gcloud firestore databases describe --database=kirigitejkf8095h` (field `locationId`). If it is not `asia-southeast1`, change `REGION` in `src/config.ts` to match (a multi-region database such as `nam5` needs a region inside it) and update the region assertions in the tests.
- When a PR moves a write server-side and tightens the rules, deploy the functions first, then the rules (`npx firebase deploy --only firestore:rules`). Otherwise the client loses the write before the server can make it.
- Slice 3 order, all in one deploy window: `npx firebase deploy --only firestore:indexes` (index `jobs(status, deadline)` for `expireJobs`; wait until it is built), then `--only functions`, then right after that `--only hosting,firestore:rules` from the 3b branch. Between the functions and hosting deploys users may see a duplicate notification (old client + server); never deploy the 3b rules before these functions, or notifications stop.
- Slice 4 order, one window: `--only firestore:rules` from the 4b branch FIRST (closes client payment writes; old tabs' `createPayment` just fails silently), then `--only functions` (4a), then `--only hosting` (4b). Before the functions deploy, list and delete any `payments` doc with `source == 'server'` (clients could forge them under the old rules).
