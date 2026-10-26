---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-reputation
base: main
slice: 6a (spec section 3, slice 6 "server reputation", Cloud Functions half)
stacked-next: feat/server-reputation-client (slice 6b: client + rules)
---

# Server reputation and cancellation (slice 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reputation and cancellation move server-side:
- A retried trigger `onRatingCreated` recomputes the rated user's `ratingAverage`, `totalRatings` and `ratingScore`.
- A retried trigger `onJobCounters` keeps `activeJobCount` and `completedJobs` on `users/{uid}`.
- A callable `cancelJob({ jobId, reason })` cancels for the poster or the assigned worker in one transaction: penalty points, held escrow refunded, job/application status, and the new `worker_cancelled` notification.
- A one-off Admin script recomputes every profile's reputation fields at deploy.

No web client and no rules change (that is 6b).

**Architecture:** Same shape as slices 4a and 5a.
- Pure rules live in `functions/src/lib/` (`reputation.ts`, `counters.ts`, `cancel.ts`).
- Handlers in `functions/src/handlers/` run one Firestore transaction each, with every read before any write.
- Triggers and the callable are thin wrappers (`triggers/escrow.ts` and `callables/disputePayment.ts` are the templates).
- Counters have a single owner: `cancelJob` and `confirmCompletion` only change job status, and `onJobCounters` reconciles the counters from the job's current state.
- The backfill script follows `unijob-web/scripts/migrate-applications.mjs`: a pure `*-plan.ts` module, dry-run by default.

**Tech Stack:** firebase-functions 7.4.0 (v2 `https`, `firestore`), firebase-admin 14.5.0, TypeScript 5.9, Vitest (projects `unit` and `emulator`), Firestore emulator (project `demo-unijob`, database `kirigitejkf8095h`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 6; decisions table in section 2; error handling in section 4). The orchestrator's slice 6 design (sections "Reputation model" and "6a"), plus its follow-up inputs (parity relaxation, backfill script), are folded into "Decisions" below.

All `Run:` lines are relative to the worktree root (the directory that contains `unijob-web/` and `scripts/`). `<EMULATOR_CONFIG>` is the firebase config file the orchestrator gives each worker (alternate emulator ports). Use `firebase.json` when running alone.

## Global Constraints

- Region `asia-southeast1` (`REGION`), database `kirigitejkf8095h` (`DATABASE_ID`), both from `src/config.ts`. Never hard-code either string in `functions/src/`. The script hard-codes the database id the same way `migrate-applications.mjs` does.
- Emulator project id is always `demo-unijob`.
  - Emulator tests connect only through `connectEmulatorDb()` (`functions/tests/support/emulatorDb.ts`).
  - Callable/trigger modules that import `src/admin.js` are imported dynamically after it (as in `tests/emulator/disputes.emulator.test.ts`).
- Callables throw `HttpsError` with Vietnamese messages. Reuse `MSG_UNAUTHENTICATED`, `MSG_NOT_VERIFIED`, `MSG_NOT_MEMBER`, `MSG_JOB_NOT_FOUND` from `src/lib/auth.ts`. New messages are exactly the `CANCEL_MSG` values in Task 4.
- Notification texts come from `messages` (`src/lib/messages.ts`), with no free user text. Job titles go through `safeTitle`.
- Retried triggers (`retry: true`) drop events older than 24 hours with `eventTooOld` (`src/lib/events.ts`), like `onJobEscrow`.
- The server never creates a `users/{uid}` doc. A missing profile is logged and its writes are skipped.
- New `functions/src/**` files need at least 70% line coverage (unit + emulator projects together). Do not lower any threshold.
- Function tests live in `unijob-web/functions/tests/unit/**` and `unijob-web/functions/tests/emulator/**`, never next to source. `firebase-functions-test` is not used: call v2 functions with `.run(...)`.
- Web-side files: only Task 7's script files under `unijob-web/scripts/` and its test under `unijob-web/tests/unit/scripts/`. Do not touch `unijob-web/src/**`, `unijob-web/firestore.rules` or `unijob-web/tests/rules/**` (that is 6b).
- Never write `service-account.json` or `.env*`. The script reads `unijob-web/scripts/service-account.json` (gitignored), like `seed.mjs`.
- Conventional Commits, message ends with `[task:N]`, never a `Co-Authored-By` trailer. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact working tree. `git commit` is its own tool call.

## Decisions

1. **Reputation fields on `users/{uid}`** (server-owned from 6b on).
   - `ratingAverage`: the average of valid ratings received, rounded to 1 decimal (`round1(x) = Math.round(x * 10) / 10`). 0 with no ratings.
   - `totalRatings`: the count of valid ratings.
   - `penaltyPoints`: the sum of cancel penalties, a non-negative integer.
   - `ratingScore = round1(max(0, ratingAverage - 0.1 * penaltyPoints))`. This keeps today's meaning (a penalty lowers the displayed score), and a rating recompute can no longer erase penalties.
   - `activeJobCount`: the number of jobs the user is currently the worker on (`in-progress`).
   - `completedJobs`: the number of completed jobs as the worker.

   A valid rating has `toUserId === uid`, `fromUserId !== uid`, a `type` of `poster-to-worker` or `worker-to-poster`, `score` an integer from 1 to 5, and a doc id exactly `${jobId}_${fromUserId}_${toUserId}`. It is counted once per that key. These are the rules' create checks, re-checked because legacy and random-id docs predate them. `aggregateRatings` takes `{ id, data }` pairs and also returns `excluded` (the other ratings addressed to the user).

   A legacy profile without a numeric `ratingAverage` uses `ratingScore` as the base when it is a number in [0, 5], else 0 (`currentAverage`). This only matters between the 6a deploy and the Task 7 backfill.

   A non-number or negative `penaltyPoints`, `activeJobCount` or `completedJobs` counts as 0.

   `lib/reputation.ts` has **no imports at all**: the Task 7 script imports it under plain Node, where `.js`-suffixed relative imports and `firebase-admin` from `functions/node_modules` are not available.
2. **Field audit for 6b** (the design asked the planner to decide per field):
   - `ratingScore`, `ratingAverage`, `totalRatings`, `penaltyPoints`, `activeJobCount`, `completedJobs`: server-maintained (this slice).
   - `maxJobLimit`: written once as `2` by `auth.service.signInWithGoogle`. Nothing updates it (`getMaxJobLimit` in `src/lib/utils.ts` has no callers). 6b locks it (create must be `2`).
   - `xp`, `level`, `badges`, `role`: not stored on users today. `gamification.service.ts` derives XP and badges from jobs and ratings, and `src/types/user.ts` has none of them. 6b denies writing them, and nothing legitimate breaks.
   - `incrementActiveJobs` / `decrementActiveJobs` (`user.service.ts`) have no callers. 6b deletes them.
3. **Job counters are reconciled from state, not counted per event.** This is idempotent under redelivery and under out-of-order events.
   - The marker is a server-only doc `jobCounters/{jobId}` = `{ activeWorker: string | null, completedWorker: string | null, updatedAt }`. It is a top-level collection with no rules `match`, so clients are denied by default.
   - Inside one transaction the handler reads the **current** job (not the event's `after`), the marker, and the user docs involved.
   - Active worker:
     - `desiredActive` = `assignedTo[0]` when the job is `in-progress`, `assignedTo[0]` is a valid doc id and it is not `postedBy`; otherwise `null`.
     - If `marker.activeWorker !== desiredActive`, the old worker gets `activeJobCount - 1` (minimum 0) and the new one `+1`.
   - Completion: when the job is `completed` with a valid worker and `marker.completedWorker` is null, that worker gets `completedJobs + 1` and `completedWorker` is set. A job completes once, so this happens at most once per job.
   - Nothing changes → no write.
   - Jobs without a marker get one from the Task 7 script at deploy. Without it, a legacy in-progress job would never decrement its worker's backfilled `activeJobCount`.
   - The handler runs only when `status` or `assignedTo[0]` changed between before and after (`countersRelevant`).
4. **`cancelJob` check order inside the transaction.** An outsider learns nothing about the job's state.
   1. Input, outside the transaction:
      - `jobId` not a doc id → `invalid-argument` (`invalid`).
      - `reason` is optional in the input. When present it must be one of `CANCEL_REASONS`, else `invalid-argument` (`invalidReason`).
   2. Job missing → `not-found` (`MSG_JOB_NOT_FOUND`).
   3. Membership:
      - `assertMember` → `permission-denied` (`MSG_NOT_MEMBER`).
      - Role `worker` with `uid !== assignedTo[0]` → `permission-denied` (`MSG_NOT_MEMBER`).
   4. `status === 'cancelled'` → `failed-precondition` (`alreadyCancelled`).
   5. Any other status the role cannot cancel → `failed-precondition` (`notCancellable`). The poster can cancel `open` and `in-progress`; the worker only `in-progress`.
   6. Worker with no reason → `invalid-argument` (`reasonRequired`).
   7. Job `in-progress` with a trusted completion (`isTrustedCompletion`) whose `workerConfirmed === true` → `failed-precondition`: `workerConfirmed` for the poster, `workerReported` for the worker. An untrusted (legacy) completion doc does not block (the server ignores it everywhere, slice 5).
   8. Job `in-progress` whose matching server payment (`paymentMatchesJob`) has status `disputed`, or whose `jobs.paymentStatus` is `disputed` → `failed-precondition` (`disputed`).
5. **`cancelJob` effects** (one transaction; response `{ penaltyPoints, status }`):
   - **Poster, `open`:** job `{ status: 'cancelled', cancelledBy: 'poster', cancelledAt, updatedAt }`, penalty 0, no user read.
   - **Poster, `in-progress`:**
     - The same job fields.
     - Penalty `POSTER_PENALTY = 5` on the poster when a valid worker other than the poster is assigned (else 0).
     - A matching `held` server payment becomes `{ status: 'refunded', refundedAt }`, and the job gets `paymentStatus: 'refunded'`.
     - `assignedTo` is kept, so `onJobUpdated` still sends `job_cancelled` to the worker.
     - `cancelReason` is NOT written: it stays reserved for the scheduler's `'expired'`.
   - **Worker, `in-progress`:**
     - Job `{ status: 'open', assignedTo: [], applicants: arrayRemove(worker), updatedAt }`, plus `paymentStatus: 'refunded'` when a held payment was refunded. `cancelledBy` is not set.
     - The application `applications/{jobId}_{worker}` gets `{ status: 'rejected', withdrawnByWorker: true, updatedAt }` when it exists. A missing one is logged and skipped.
     - Penalty `workerPenalty(deadlineMs, now)`, from the hours to `jobs.deadline` (a `Timestamp`, converted with `toMillis()` in `lib/cancel.ts`):
       - < 12 h → 20 (a passed deadline included)
       - < 24 h → 10
       - otherwise, or with no or invalid deadline → 5
       - The deadline day follows the expiry scheduler: `lib/deadline.ts` (moved from `handlers/expireJobs.ts`) gives `vnDayEndMillis` (23:59:59.999 +07:00) and `isLegacyNoDeadline`. A legacy no-deadline job (deadline = creation time) counts as no deadline; any other deadline counts to the end of its Vietnam day, so a legacy `YYYY-MM-DD` deadline (00:00 UTC) is not read as already near.
     - After the commit: `worker_cancelled` to the poster, sourceId `${jobId}_${workerId}`, message `messages.workerCancelled(title)`. A failed notification is logged, never thrown (as in `disputePayment`).
   - **Penalty write:** read `users/{penalisedUid}` in the transaction. `penaltyPoints = current + points`, and `ratingScore` is recomputed with `currentAverage`.
     - Missing profile → `logger.warn` and a profile stub (`profileStub`, `set(..., { merge: true })`, only when the doc does not exist): `uid`, `stub: true` and the server fields (`penaltyPoints` and `ratingScore` as computed, the rest 0). A missing doc cannot launder a penalty, so the response `penaltyPoints` is the applied penalty. `onRatingCreated` and `onJobCounters` write the same stub instead of skipping a missing profile. `stub: true` is never added to an existing profile. The stub has no email or name: the 6b sign-in completes a stub once and then removes the marker.
     - The reason is never stored; it is logged with `logger.info`.
   - `activeJobCount` is never touched here (Decision 3 owns it).
6. **Escrow re-hold.** `handleEscrowOnAssign` keeps returning `'exists'` for a matching server payment, except when its status is `refunded`. A refunded payment is overwritten by a fresh held record (`'created'`), so a worker who cancelled and is later re-assigned to the same job gets escrow held again. `released` and `disputed` stay `'exists'`.
7. **Existing triggers.**
   - `onJobUpdated` already ignores `in-progress -> open` (no `job_cancelled` on a worker cancel) and sends `job_cancelled` on the poster's `-> cancelled`.
   - `onJobEscrow` ignores `in-progress -> open` (hold needs `open -> in-progress`, release needs `-> completed`).
   - `onApplicationUpdated` only notifies from `pending`, so `accepted -> rejected` sends no `application_rejected`.

   None of them change. Task 6 pins all three on real server writes.
8. **`NotificationType` parity during the 6a/6b split** (as in slice 4a, Decision 7 of `docs/plans/2026-10-25-server-escrow.md`):
   - 6a adds `worker_cancelled` to the functions `NotificationType` only.
   - `functions/tests/unit/parity.test.ts` is relaxed to `expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType | 'worker_cancelled'>()`.
   - 6b adds the member to the web type and `NotificationBell`, then restores strict equality. 6a never edits web `src/`.
9. **Auth.** `cancelJob` uses `requireVerifiedMember` (it is a reputation and money callable). No App Check yet, as for `disputePayment`.
10. **Reputation backfill script** (`unijob-web/scripts/recompute-reputation.mjs`, Task 7).
    - Dry-run by default, `--apply` to write. Admin SDK with `scripts/service-account.json`, database `kirigitejkf8095h`.
    - For every existing `users` doc it computes `{ ratingAverage, totalRatings, ratingScore, penaltyPoints, activeJobCount, completedJobs }`:
      - `ratingAverage` and `totalRatings`: `aggregateRatings` over all `ratings`.
      - `penaltyPoints`: the current valid value, or 0 if absent or invalid.
      - `activeJobCount`: in-progress jobs whose `assignedTo[0]` is the user (and not the poster).
      - `completedJobs`: completed jobs with the same rule.
      - `ratingScore`: `reputationScore(ratingAverage, penaltyPoints)`.
    - It also sets `jobCounters/{jobId}` for every in-progress or completed job whose stored marker differs from `markerFor(job)` (it reads `jobCounters` and skips equal ones), so the trigger's later reconcile matches the backfilled counts.
    - `aggregateRatings` only counts ratings with the `${jobId}_${from}_${to}` id and a valid type and score; the run prints how many ratings it excluded.
    - Non-number stored values are treated as invalid (kept out of `before`, printed as `invalid <JSON>`), and every value read from Firestore is printed with `JSON.stringify`.
    - Only docs whose values differ are written, in batches of at most 400 writes. Ratings for users without a profile are ignored, and no profile is created.
    - Run it in a quiet window (nobody rating, assigning or completing jobs). After `--apply`, a mandatory second dry-run must plan nothing (`users=0 markers=0`); anything left means data moved meanwhile.
    - It cannot recover penalties forged downward between the 6a and 6b deploys. Deploying both in one window keeps that gap minutes long.
11. **Deploy order** (README, Task 8), one window:
    1. 6a `--only functions`.
    2. 6b `--only hosting,firestore:rules`.
    3. `node scripts/recompute-reputation.mjs` (dry-run, review), then `--apply`.

    Deploying the 6b rules before the functions would break cancellation for everyone. The script runs after the rules, so clients can no longer overwrite the fixed values.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `unijob-web/functions/src/lib/reputation.ts` (create) | `round1`, `reputationScore`, `currentAverage`, `currentCount`, `aggregateRatings`, `planPenalty`, `workerPenalty`, `POSTER_PENALTY` | 1 |
| `unijob-web/functions/src/handlers/ratings.ts` (create) | `handleRatingCreated` (transaction) | 2 |
| `unijob-web/functions/src/triggers/ratings.ts` (create) | `onRatingCreated` (retried) | 2 |
| `unijob-web/functions/src/lib/counters.ts` (create) | `countersRelevant`, `planCounters`, types | 3 |
| `unijob-web/functions/src/handlers/counters.ts` (create) | `handleJobCounters` (transaction) | 3 |
| `unijob-web/functions/src/triggers/counters.ts` (create) | `onJobCounters` (retried) | 3 |
| `unijob-web/functions/src/lib/cancel.ts` (create) | `CANCEL_MSG`, `CANCEL_REASONS`, `parseCancelInput`, `cancelParties`, `planCancel` | 4 |
| `unijob-web/functions/src/lib/messages.ts`, `lib/types.ts` (modify) | `workerCancelled`, `'worker_cancelled'` | 4 |
| `unijob-web/functions/src/handlers/cancelJob.ts` (create) | `handleCancelJob` (transaction + notification) | 5 |
| `unijob-web/functions/src/callables/cancelJob.ts` (create) | `cancelJob` (onCall) | 5 |
| `unijob-web/functions/src/handlers/payments.ts` (modify) | re-hold a refunded payment | 6 |
| `unijob-web/scripts/recompute-reputation-plan.ts` (create) | `planReputation`, `markerFor`, `chunk` (pure) | 7 |
| `unijob-web/scripts/recompute-reputation.mjs` (create) | Admin SDK runner (dry-run / `--apply`) | 7 |
| `unijob-web/functions/src/index.ts`, `functions/README.md`, `docs/backlog/security-holes.md` (modify) | exports, docs, deploy order | 8 |

## Parallelism

- **Tasks 1 and 3** have no dependencies and disjoint files. Run them in parallel.
- **Tasks 2 and 4** both need Task 1, not each other (disjoint files). Run them in parallel once Task 1 is in.
- **Task 7** needs Tasks 1 and 3 only (it imports `lib/reputation.ts` and tests against `lib/counters.ts`). It can run in parallel with Tasks 2, 4, 5 and 6.
- **Task 5** needs Task 4.
- **Task 6** needs Tasks 3 and 5.
- **Task 8** runs last (needs 2, 3, 5, 6 and 7).
- `src/index.ts` is only edited in Task 8, so `functions/tests/unit/index.test.ts` stays green until then.

## Review Focus

1. **Redelivered and out-of-order job events** (open→in-progress delivered twice, or after the →completed event): counters never double count, and `activeJobCount` never goes negative. Tested in Task 3 (redelivery, reconcile from the current job, minimum 0).
2. **Two ratings for the same user created at once**: both triggers recompute inside a transaction that reads the user doc, so the final `totalRatings` is 2, not 1. Tested in Task 2.
3. **The poster cancels between the worker's report and the poster's confirmation, or during a dispute**: denied, and escrow stays `held` / `disputed`. A forged legacy completion (no marker) does not block. Tested in Task 5.
4. **The worker double-clicks cancel**: one call succeeds, the other is `permission-denied` (no longer assigned), and the penalty is applied once. Tested in Task 5.
5. **A legacy in-progress job completing after the backfill**: the script writes its `jobCounters` marker, so the worker's backfilled `activeJobCount` goes back down. Tested in Task 7 (`markerFor` agrees with `planCounters`), and the re-assignment path in Task 6.

---

### Task 1: Reputation rules (`lib/reputation.ts`)

**Files:**

- Create: `unijob-web/functions/src/lib/reputation.ts`
- Test: `unijob-web/functions/tests/unit/reputation.test.ts`

**Interfaces:**

- Produces (all pure, no imports; Decision 1):
  - `round1(x: number): number`
  - `reputationScore(ratingAverage: number, penaltyPoints: number): number`
  - `currentAverage(user: Record<string, unknown> | undefined): number` (with the legacy fallback)
  - `currentCount(value: unknown): number`: a non-negative integer, else 0.
  - `aggregateRatings(uid: string, ratings: Array<Record<string, unknown>>): { ratingAverage: number; totalRatings: number }`
  - `planPenalty(user: Record<string, unknown> | undefined, points: number): { penaltyPoints: number; ratingScore: number }`
  - `export const POSTER_PENALTY = 5;`
  - `workerPenalty(deadlineMs: number | null, now: number): 5 | 10 | 20`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  aggregateRatings, currentAverage, currentCount, planPenalty, POSTER_PENALTY, reputationScore, round1, workerPenalty,
} from '../../src/lib/reputation.js';

const r = (score: unknown, extra: Record<string, unknown> = {}) => ({ toUserId: 'u1', fromUserId: 'x', score, ...extra });
const NOW = 1_800_000_000_000;
const inHours = (h: number) => NOW + h * 3_600_000;

describe('reputation', () => {
  it('round1 and reputationScore', () => {
    expect(round1(4.25)).toBe(4.3);
    expect(reputationScore(4.3, 5)).toBe(3.8);
    expect(reputationScore(1, 20)).toBe(0); // never negative
    expect(reputationScore(0, 0)).toBe(0);
  });
  it('aggregateRatings counts only valid ratings for that user', () => {
    expect(aggregateRatings('u1', [r(5), r(4), r(4)])).toEqual({ ratingAverage: 4.3, totalRatings: 3 });
    expect(aggregateRatings('u1', [r(5), r(0), r(6), r(4.5), r('5'), r(3, { toUserId: 'u2' }), r(1, { fromUserId: 'u1' })]))
      .toEqual({ ratingAverage: 5, totalRatings: 1 });
    expect(aggregateRatings('u1', [])).toEqual({ ratingAverage: 0, totalRatings: 0 });
  });
  it('currentAverage falls back to a legacy ratingScore in [0, 5]', () => {
    expect(currentAverage({ ratingAverage: 4.5, ratingScore: 3 })).toBe(4.5);
    expect(currentAverage({ ratingScore: 4.2 })).toBe(4.2);
    expect(currentAverage({ ratingScore: 9 })).toBe(0);
    expect(currentAverage(undefined)).toBe(0);
  });
  it('currentCount treats junk as 0', () => {
    expect(currentCount(3)).toBe(3);
    for (const v of [-1, 1.5, '2', null, undefined]) expect(currentCount(v)).toBe(0);
  });
  it('planPenalty adds points and recomputes the score', () => {
    expect(planPenalty({ ratingAverage: 4.5, penaltyPoints: 5 }, 5)).toEqual({ penaltyPoints: 10, ratingScore: 3.5 });
    expect(planPenalty({ ratingScore: 4.2 }, POSTER_PENALTY)).toEqual({ penaltyPoints: 5, ratingScore: 3.7 });
  });
  it.each([
    ['6h left', inHours(6), 20], ['passed', inHours(-2), 20], ['12h left', inHours(12), 10],
    ['23h left', inHours(23), 10], ['24h left', inHours(24), 5], ['no deadline', null, 5],
  ])('workerPenalty %s -> %d', (_l, deadlineMs, points) => expect(workerPenalty(deadlineMs, NOW)).toBe(points));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/reputation.test.ts`
Expected: FAIL, cannot resolve `src/lib/reputation.js`.

- [ ] **Step 3: Implement `src/lib/reputation.ts`**

Implement the Interfaces above. The file has no `import` statement at all (Decision 1): the Task 7 script loads it under plain Node.

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/reputation.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/reputation.ts unijob-web/functions/tests/unit/reputation.test.ts
git commit -m "feat(functions): add server reputation rules [task:1]"
```

---

### Task 2: Rating aggregate trigger `onRatingCreated`

**Depends on Task 1. Independent of Tasks 4 and 7.**

**Files:**

- Create: `unijob-web/functions/src/handlers/ratings.ts`, `unijob-web/functions/src/triggers/ratings.ts`
- Test: `unijob-web/functions/tests/emulator/ratings.emulator.test.ts`, `unijob-web/functions/tests/unit/triggers/ratings.test.ts`

**Interfaces:**

- Consumes:
  - From Task 1: `aggregateRatings`, `currentCount`, `reputationScore`.
  - Existing: `isDocId` (`lib/jobs.ts`), `eventTooOld`.
- Produces:
  - `handleRatingCreated(db: Firestore, ratingId: string, rating: DocumentData | undefined): Promise<'updated' | 'skipped'>`
  - `onRatingCreated`: `onDocumentCreated({ document: 'ratings/{ratingId}', database: DATABASE_ID, region: REGION, retry: true })`.

- [ ] **Step 1: Write the failing emulator test**

`ratings.emulator.test.ts`, set up like `confirmCompletion.emulator.test.ts`, with two helpers:

- `seedUser(uid, fields)` writes `users/{uid}`.
- `rate(to, score, from = uid('from'))` writes `ratings/{jobId}_{from}_{to}` and returns `[id, data]`.

Tests:

```ts
it('recomputes average, count and score (with penalties) from all ratings', async () => {
  const u = uid('u');
  await seedUser(u, { ratingScore: 0, totalRatings: 0, penaltyPoints: 5 });
  await rate(u, 5); await rate(u, 4);
  const [id, data] = await rate(u, 4);
  await expect(handleRatingCreated(db, id, data)).resolves.toBe('updated');
  expect((await db.doc(`users/${u}`).get()).data()).toMatchObject({ ratingAverage: 4.3, totalRatings: 3, ratingScore: 3.8, penaltyPoints: 5 });
});
it('redelivery gives the same result (recompute, not increment)', async () => { /* run handleRatingCreated twice: totalRatings stays 1 */ });
it('concurrent triggers for two ratings of the same user end at totalRatings 2', async () => {
  /* seed user, write two ratings, Promise.all both handlers -> totalRatings 2, ratingAverage = round1 of both */
});
it('a missing profile is skipped and not created', async () => { /* 'skipped'; users/{u} does not exist */ });
it.each([['no toUserId', {}], ['toUserId with a slash', { toUserId: 'a/b' }], ['no data', undefined]])(
  '%s is skipped', async (_l, data) => { /* 'skipped' */ });
it('ignores invalid legacy ratings in the average', async () => { /* a legacy score 0 and a self-rating are not counted */ });
```

Write the bodies from the comments in the style of the first test.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/ratings.emulator.test.ts"`
Expected: FAIL, cannot resolve `src/handlers/ratings.js`.

- [ ] **Step 3: Implement `handleRatingCreated`**

1. `toUserId` must be a valid doc id, else log and return `'skipped'`.
2. In one `db.runTransaction`, read in parallel: `tx.get(db.collection('ratings').where('toUserId', '==', uid))` and `tx.get(userRef)`.
3. Missing user → `logger.warn`, return `'skipped'`.
4. Otherwise `tx.update(userRef, { ratingAverage, totalRatings, ratingScore: reputationScore(ratingAverage, currentCount(user.penaltyPoints)) })`. Do not touch `updatedAt` (the profile's own edit time).

- [ ] **Step 4: Trigger and its unit test**

`triggers/ratings.ts`: copy `triggers/escrow.ts`.
- Too-old events are dropped with `logger.error('onRatingCreated: event too old, dropped', …)`.
- Otherwise it calls `handleRatingCreated(db, ratingId, event.data?.data())`.

`tests/unit/triggers/ratings.test.ts`: copy `tests/unit/triggers/escrow.test.ts`, with `eventType: 'google.cloud.firestore.document.v1.created'` and `document: 'ratings/{ratingId}'`. Cover:
- the endpoint shape, including `retry: true`
- the args passed to the handler
- handler failures propagate
- too-old events are dropped

- [ ] **Step 5: Run to verify it passes**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/ratings.emulator.test.ts"`
Expected: PASS (8 tests).

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/ratings.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/functions/src/handlers/ratings.ts unijob-web/functions/src/triggers/ratings.ts unijob-web/functions/tests/emulator/ratings.emulator.test.ts unijob-web/functions/tests/unit/triggers/ratings.test.ts
git commit -m "feat(functions): recompute rating aggregates server-side on rating create [task:2]"
```

---

### Task 3: Job counters trigger `onJobCounters`

**No dependencies. Parallel with Task 1.**

**Files:**

- Create: `unijob-web/functions/src/lib/counters.ts`, `unijob-web/functions/src/handlers/counters.ts`, `unijob-web/functions/src/triggers/counters.ts`
- Test: `unijob-web/functions/tests/unit/counters.test.ts`, `unijob-web/functions/tests/unit/triggers/counters.test.ts`, `unijob-web/functions/tests/emulator/counters.emulator.test.ts`

**Interfaces:**

- Consumes: `isDocId`, `toJobInfo`, `eventTooOld`. Do not import `lib/reputation.ts`: this task runs in parallel with Task 1, so use a local `count(v)` helper with the same rule as `currentCount`.
- Produces:
  - `interface CounterMarker { activeWorker: string | null; completedWorker: string | null }`
  - `countersRelevant(before: DocumentData | undefined, after: DocumentData | undefined): boolean`: true when `status` or `assignedTo[0]` differs.
  - `planCounters(jobId: string, job: DocumentData | undefined, marker: DocumentData | undefined): { next: CounterMarker; active: Array<{ uid: string; delta: 1 | -1 }>; completed: string | null } | null`: Decision 3. `null` = nothing to change.
  - `handleJobCounters(db: Firestore, jobId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<'updated' | 'unchanged' | 'skipped'>`. `'skipped'` = not relevant, or the job is missing.
  - `onJobCounters`: `onDocumentUpdated({ document: 'jobs/{jobId}', database: DATABASE_ID, region: REGION, retry: true })`.

- [ ] **Step 1: Write the failing unit tests (`tests/unit/counters.test.ts`)**

```ts
const job = (status: string, assignedTo: string[] = ['w1']) => ({ postedBy: 'p1', status, assignedTo });
it('in-progress with no marker: +1 for the worker', () =>
  expect(planCounters('j1', job('in-progress'), undefined)).toEqual({ next: { activeWorker: 'w1', completedWorker: null }, active: [{ uid: 'w1', delta: 1 }], completed: null }));
it('same state again: nothing to change', () =>
  expect(planCounters('j1', job('in-progress'), { activeWorker: 'w1', completedWorker: null })).toBeNull());
it('completed: -1 active and +1 completed, once', () => {
  expect(planCounters('j1', job('completed'), { activeWorker: 'w1', completedWorker: null })).toEqual({ next: { activeWorker: null, completedWorker: 'w1' }, active: [{ uid: 'w1', delta: -1 }], completed: 'w1' });
  expect(planCounters('j1', job('completed'), { activeWorker: null, completedWorker: 'w1' })).toBeNull();
});
it('legacy in-progress job completing without a marker: +1 completed only', () =>
  expect(planCounters('j1', job('completed'), undefined)).toMatchObject({ active: [], completed: 'w1' }));
it.each([['open (worker cancel)', job('open', [])], ['cancelled', job('cancelled')]])('%s: -1 for the previous worker', (_l, j) =>
  expect(planCounters('j1', j, { activeWorker: 'w1', completedWorker: null })).toMatchObject({ active: [{ uid: 'w1', delta: -1 }], completed: null }));
it('worker swapped while in progress: -1 old, +1 new', () =>
  expect(planCounters('j1', job('in-progress', ['w2']), { activeWorker: 'w1', completedWorker: null })?.active).toEqual([{ uid: 'w1', delta: -1 }, { uid: 'w2', delta: 1 }]));
it.each([['poster as worker', job('in-progress', ['p1'])], ['bad id', job('in-progress', ['a/b'])], ['open, no marker', job('open', [])]])(
  '%s: nothing to count', (_l, j) => expect(planCounters('j1', j, undefined)).toBeNull());
it('countersRelevant', () => {
  expect(countersRelevant(job('open', []), job('in-progress'))).toBe(true);
  expect(countersRelevant(job('in-progress'), { ...job('in-progress'), title: 'x' })).toBe(false);
  expect(countersRelevant(job('in-progress', ['w1']), job('in-progress', ['w2']))).toBe(true);
  expect(countersRelevant(undefined, job('open'))).toBe(false);
});
```

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/counters.test.ts`
Expected: FAIL, cannot resolve `src/lib/counters.js`.

- [ ] **Step 2: Implement `src/lib/counters.ts`**

Implement the Interfaces and Decision 3. In the `active` list, the decrement comes first. No Admin import.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/counters.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing emulator test (`counters.emulator.test.ts`)**

The helper `jobFor(worker, status)` seeds `users/{worker}` `{ activeJobCount: 0 }` (no `completedJobs`) and the job. Each transition updates the job doc to `after`, then calls `handleJobCounters(db, jobId, before, after)`. Tests:
- `open -> in-progress: activeJobCount 1, marker written; redelivered twice concurrently: still 1`
- `-> completed: activeJobCount 0, completedJobs 1; redelivered: unchanged`
- `in-progress -> open (worker cancel): activeJobCount back to 0; a profile already at 0 stays 0 (never negative)`
- `in-progress -> cancelled: activeJobCount -1`
- `an old open -> in-progress event delivered after the job was cancelled changes nothing (reconciles from the current job)`
- `two jobs assigned to the same worker at once: activeJobCount 2`
- `a missing worker profile: marker still written, no users doc created, 'updated'`
- `an irrelevant update (title only) is 'skipped' and writes no marker`

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/counters.emulator.test.ts"`
Expected: FAIL, cannot resolve `src/handlers/counters.js`.

- [ ] **Step 4: Implement `handleJobCounters` and `onJobCounters`**

Handler:
1. `countersRelevant(before, after)` is false → `'skipped'`.
2. Transaction reads, all before any write:
   - The job and `jobCounters/{jobId}`. Job missing → `'skipped'`.
   - Then `planCounters`. `null` → `'unchanged'`.
   - Then every user doc in `active` / `completed`.
3. Each existing user gets one `tx.update` with the new `activeJobCount` (`max(0, count + delta)`) and/or `completedJobs + 1`. A missing user is logged with `logger.warn` and skipped.
4. `tx.set(markerRef, { ...next, updatedAt: serverTimestamp() })`, then return `'updated'`.

Trigger: copy `triggers/escrow.ts`, with log label `onJobCounters`. Its unit test `tests/unit/triggers/counters.test.ts` copies `tests/unit/triggers/escrow.test.ts`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/counters.emulator.test.ts"`
Expected: PASS (8 tests).

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/counters.test.ts tests/unit/triggers/counters.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/functions/src/lib/counters.ts unijob-web/functions/src/handlers/counters.ts unijob-web/functions/src/triggers/counters.ts unijob-web/functions/tests/unit/counters.test.ts unijob-web/functions/tests/unit/triggers/counters.test.ts unijob-web/functions/tests/emulator/counters.emulator.test.ts
git commit -m "feat(functions): maintain activeJobCount and completedJobs server-side [task:3]"
```

---

### Task 4: Cancel rules (`lib/cancel.ts`), `worker_cancelled` type and message

**Depends on Task 1. Independent of Tasks 2 and 7.**

**Files:**

- Create: `unijob-web/functions/src/lib/cancel.ts`
- Modify: `unijob-web/functions/src/lib/messages.ts`, `unijob-web/functions/src/lib/types.ts`
- Test: `unijob-web/functions/tests/unit/cancel.test.ts`, `unijob-web/functions/tests/unit/messages.test.ts`, `unijob-web/functions/tests/unit/parity.test.ts`

**Interfaces:**

- Consumes:
  - From Task 1: `POSTER_PENALTY`, `workerPenalty`.
  - Existing: `assertMember`, `MSG_NOT_MEMBER`, `MSG_JOB_NOT_FOUND`, `isDocId`, `toJobInfo`, `JobInfo`, `isTrustedCompletion`, `paymentMatchesJob`, the `Timestamp` class.
- Produces:
  - ```ts
    export const CANCEL_MSG = {
      invalid: 'Yêu cầu không hợp lệ.',
      invalidReason: 'Lý do hủy không hợp lệ.',
      reasonRequired: 'Vui lòng chọn lý do hủy công việc.',
      notCancellable: 'Không thể hủy công việc ở trạng thái hiện tại.',
      alreadyCancelled: 'Công việc này đã bị hủy.',
      workerConfirmed: 'Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.',
      workerReported: 'Bạn đã báo hoàn thành công việc này nên không thể hủy.',
      disputed: 'Thanh toán ký quỹ đang bị tranh chấp nên không thể hủy công việc.',
    } as const;
    export const CANCEL_REASONS = ['Không thể hoàn thành đúng deadline', 'Yêu cầu công việc thay đổi quá nhiều', 'Lý do cá nhân khẩn cấp', 'Khác'] as const;
    export type CancelReason = (typeof CANCEL_REASONS)[number];
    ```
    `CANCEL_REASONS` is byte-identical to `CancelReason` in `src/services/cancel.service.ts`.
  - `interface CancelJobResult { penaltyPoints: number; status: 'cancelled' | 'open' }`
  - `parseCancelInput(data: unknown): { jobId: string; reason: CancelReason | null }`: Decision 4.1. A missing or `null` reason → `null`.
  - `cancelParties(jobId: string, job: DocumentData | undefined, uid: string, reason: CancelReason | null): { role: MemberRole; info: JobInfo; workerId: string | null }`
    - Runs Decision 4.2–4.6, in that order.
    - `workerId` = `assignedTo[0]` when it is a valid doc id other than `postedBy`, else `null`.
  - `interface CancelPlan { next: 'cancelled' | 'open'; penalisedUid: string | null; points: number; refund: boolean }`
  - `planCancel(p: { role: MemberRole; info: JobInfo; workerId: string | null; job: DocumentData; completion: DocumentData | undefined; payment: DocumentData | undefined; now: number }): CancelPlan`
    - Runs Decision 4.7–4.8, then plans Decision 5.
    - `refund` = the payment matches the job and has status `held`.
    - Poster on `open`: `{ next: 'cancelled', penalisedUid: null, points: 0 }`.
    - Poster on `in-progress`: `POSTER_PENALTY` points on `postedBy` when `workerId` is set, else 0 points and `null`.
    - Worker: `{ next: 'open', penalisedUid: workerId, points: workerPenalty(deadlineMs, now) }`, where `deadlineMs = job.deadline instanceof Timestamp ? job.deadline.toMillis() : null`.
  - `messages.workerCancelled(title)` = `` `⚠️ Người làm đã hủy nhận công việc "${t(title)}". Công việc đã được mở lại để tìm người khác.` ``
  - `NotificationType` gains `| 'worker_cancelled'`. Its comment points at Decision 8 of this plan.

- [ ] **Step 1: Write the failing tests**

`tests/unit/cancel.test.ts` uses these fixtures:
- `job` = `{ title: 'Nhập liệu', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'], payment: 150_000, paymentType: 'fixed' }`
- `trusted` = `{ jobId: 'j1', source: 'server', serverVersion: 'completion-v1', workerConfirmed: true }`
- `held` = `{ jobId: 'j1', payerId: 'p1', payeeId: 'w1', status: 'held', source: 'server' }`

```ts
describe('parseCancelInput', () => {
  it('accepts a known reason or none', () => {
    expect(parseCancelInput({ jobId: 'j1', reason: 'Khác' })).toEqual({ jobId: 'j1', reason: 'Khác' });
    expect(parseCancelInput({ jobId: 'j1' })).toEqual({ jobId: 'j1', reason: null });
  });
  it.each([[{ jobId: 'a/b' }, CANCEL_MSG.invalid], [null, CANCEL_MSG.invalid], [{ jobId: 'j1', reason: 'lý do khác' }, CANCEL_MSG.invalidReason], [{ jobId: 'j1', reason: 3 }, CANCEL_MSG.invalidReason]])(
    'rejects %j', (data, message) => expect(() => parseCancelInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message })));
});

describe('cancelParties', () => {
  it.each([
    ['missing job', undefined, 'p1', 'Khác', 'not-found', MSG_JOB_NOT_FOUND],
    ['outsider on a cancelled job', { ...job, status: 'cancelled' }, 'mallory', 'Khác', 'permission-denied', MSG_NOT_MEMBER],
    ['second assignee', { ...job, assignedTo: ['w1', 'w2'] }, 'w2', 'Khác', 'permission-denied', MSG_NOT_MEMBER],
    ['already cancelled', { ...job, status: 'cancelled' }, 'p1', null, 'failed-precondition', CANCEL_MSG.alreadyCancelled],
    ['poster on completed', { ...job, status: 'completed' }, 'p1', null, 'failed-precondition', CANCEL_MSG.notCancellable],
    ['worker on completed', { ...job, status: 'completed' }, 'w1', 'Khác', 'failed-precondition', CANCEL_MSG.notCancellable],
    ['worker without a reason', job, 'w1', null, 'invalid-argument', CANCEL_MSG.reasonRequired],
  ] as const)('%s', (_l, data, uid, reason, code, message) =>
    expect(() => cancelParties('j1', data, uid, reason)).toThrow(expect.objectContaining({ code, message })));
  it('poster without a reason is fine; workerId null when the poster is the assignee', () => {
    expect(cancelParties('j1', job, 'p1', null)).toMatchObject({ role: 'poster', workerId: 'w1' });
    expect(cancelParties('j1', { ...job, assignedTo: ['p1'] }, 'p1', null).workerId).toBeNull();
  });
});

describe('planCancel', () => {
  const base = (role: 'poster' | 'worker', j: Record<string, unknown> = job) =>
    ({ role, info: toJobInfo('j1', j)!, workerId: 'w1', job: j, completion: undefined, payment: held, now: 0 });
  it('poster, open: cancelled, no penalty', () =>
    expect(planCancel({ ...base('poster', { ...job, status: 'open', assignedTo: [] }), workerId: null, payment: undefined })).toEqual({ next: 'cancelled', penalisedUid: null, points: 0, refund: false }));
  it('poster, in progress with held escrow: 5 points, refund', () =>
    expect(planCancel(base('poster'))).toEqual({ next: 'cancelled', penalisedUid: 'p1', points: 5, refund: true }));
  it('worker, no deadline: open, 5 points, refund', () =>
    expect(planCancel(base('worker'))).toEqual({ next: 'open', penalisedUid: 'w1', points: 5, refund: true }));
  it('worker, deadline Timestamp in 6h: 20 points; a non-Timestamp deadline counts as none', () => {
    expect(planCancel({ ...base('worker', { ...job, deadline: Timestamp.fromMillis(6 * 3_600_000) }) }).points).toBe(20);
    expect(planCancel({ ...base('worker', { ...job, deadline: '2026-01-01' }) }).points).toBe(5);
  });
  it.each([['poster', CANCEL_MSG.workerConfirmed], ['worker', CANCEL_MSG.workerReported]] as const)('%s after a trusted worker report is denied', (role, message) =>
    expect(() => planCancel({ ...base(role), completion: trusted })).toThrow(expect.objectContaining({ code: 'failed-precondition', message })));
  it('an untrusted legacy completion does not block', () =>
    expect(planCancel({ ...base('poster'), completion: { ...trusted, serverVersion: undefined } }).next).toBe('cancelled'));
  it.each([['payment disputed', { payment: { ...held, status: 'disputed' } }], ['job paymentStatus disputed', { job: { ...job, paymentStatus: 'disputed' }, payment: undefined }]])(
    '%s is denied', (_l, over) => expect(() => planCancel({ ...base('poster'), ...over })).toThrow(expect.objectContaining({ message: CANCEL_MSG.disputed })));
  it.each([['released', { ...held, status: 'released' }], ['forged (no source)', { ...held, source: undefined }], ['other payee', { ...held, payeeId: 'w9' }]])(
    '%s payment is not refunded', (_l, payment) => expect(planCancel({ ...base('poster'), payment }).refund).toBe(false));
});
```

In `tests/unit/messages.test.ts` add:

```ts
it('workerCancelled', () => {
  expect(messages.workerCancelled('Xem www.evil.com')).toBe('⚠️ Người làm đã hủy nhận công việc "Xem [liên kết]". Công việc đã được mở lại để tìm người khác.');
});
```

In `tests/unit/parity.test.ts` (Decision 8):
- Change the type assertion to `expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType | 'worker_cancelled'>();`.
- Add a test that `CancelReason` equals the web union: `expectTypeOf<CancelReason>().toEqualTypeOf<import('../../../src/services/cancel.service.ts').CancelReason>()`.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/cancel.test.ts tests/unit/messages.test.ts tests/unit/parity.test.ts`
Expected: FAIL (missing module, missing `workerCancelled`; the parity test fails typecheck).

- [ ] **Step 3: Implement**

- `lib/cancel.ts`: the Interfaces above, with no db access. In `planCancel`, both the dispute check and the refund decision use `paymentMatchesJob(payment, info.id, job)`.
- `messages.ts` and `types.ts`: as listed in the Interfaces.

If the parity test cannot import the web `cancel.service.ts` type without pulling Firebase into typecheck, copy the four literals into the test instead, and note that in the commit body.

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/cancel.test.ts tests/unit/messages.test.ts tests/unit/parity.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/cancel.ts unijob-web/functions/src/lib/messages.ts unijob-web/functions/src/lib/types.ts unijob-web/functions/tests/unit/cancel.test.ts unijob-web/functions/tests/unit/messages.test.ts unijob-web/functions/tests/unit/parity.test.ts
git commit -m "feat(functions): add server cancel rules and the worker_cancelled notification type [task:4]"
```

---

### Task 5: `handleCancelJob` transaction and `cancelJob` callable

**Depends on Task 4.**

**Files:**

- Create: `unijob-web/functions/src/handlers/cancelJob.ts`, `unijob-web/functions/src/callables/cancelJob.ts`
- Test: `unijob-web/functions/tests/emulator/cancelJob.emulator.test.ts`, `unijob-web/functions/tests/unit/callables/cancelJob.test.ts`

**Interfaces:**

- Consumes:
  - From Task 4: `parseCancelInput`, `cancelParties`, `planCancel`, `CancelJobResult`, `CANCEL_MSG`.
  - From Task 1: `planPenalty`.
  - Existing: `paymentIdFor`, `writeNotification`, `messages.workerCancelled`, `safeTitle`, `requireVerifiedMember`.
- Produces:
  - `handleCancelJob(db: Firestore, uid: string, data: unknown, now?: () => number): Promise<CancelJobResult>` (`now` defaults to `Date.now`).
  - `cancelJob` (v2 `onCall`, region `REGION`), re-exporting `type CancelJobResult`. 6b calls it with `{ jobId, reason? }`.

- [ ] **Step 1: Write the failing emulator test**

Helpers:
- `inProgressJob({ job, held, user })` seeds:
  - `users/{poster}` and `users/{worker}`, each `{ ratingAverage: 4.5, ratingScore: 4.5, totalRatings: 2, penaltyPoints: 0, ...user }`
  - the job, with `applicants: [worker]`, `assignedTo: [worker]`, `deadline: null`
  - `applications/{jobId}_{worker}` `{ jobId, applicantId: worker, status: 'accepted' }`
- With `held: true`, `inProgressJob` also seeds the server payment exactly as `heldJob` in `disputes.emulator.test.ts` does, and sets `paymentStatus: 'held'` on the job.
- `completion(jobId, fields)` seeds a trusted `jobCompletions/{jobId}` (`source: 'server'`, `serverVersion: 'completion-v1'`, `jobId`).

Tests (key assertions as code, the rest from their names):

```ts
it('worker cancels 6h before the deadline: job reopened, application withdrawn, escrow refunded, 20 points, poster notified', async () => {
  const now = Date.now();
  const s = await inProgressJob({ held: true, job: { deadline: Timestamp.fromMillis(now + 6 * 3_600_000) } });
  await expect(handleCancelJob(db, s.worker, { jobId: s.jobId, reason: 'Lý do cá nhân khẩn cấp' }, () => now)).resolves.toEqual({ penaltyPoints: 20, status: 'open' });
  const j = (await s.jobRef.get()).data();
  expect(j).toMatchObject({ status: 'open', assignedTo: [], applicants: [], paymentStatus: 'refunded' });
  expect(j?.cancelledBy).toBeUndefined();
  expect((await s.appRef.get()).data()).toMatchObject({ status: 'rejected', withdrawnByWorker: true });
  const pay = (await s.payRef.get()).data();
  expect(pay?.status).toBe('refunded');
  expect(pay?.refundedAt).toBeInstanceOf(Timestamp);
  expect((await db.doc(`users/${s.worker}`).get()).data()).toMatchObject({ penaltyPoints: 20, ratingScore: 2.5, ratingAverage: 4.5 });
  const docs = await notificationsFor(db, s.poster);
  expect(docs.map((d) => d.id)).toEqual([`worker_cancelled_${s.jobId}_${s.worker}`]);
  expect(docs[0].data()).toMatchObject({ type: 'worker_cancelled', source: 'server', jobId: s.jobId, message: '⚠️ Người làm đã hủy nhận công việc "Nhập liệu". Công việc đã được mở lại để tìm người khác.' });
});
it('poster cancels an in-progress job with held escrow: cancelled, refunded, 5 points on the poster, worker application unchanged', async () => {
  /* response { penaltyPoints: 5, status: 'cancelled' }; job { status: 'cancelled', cancelledBy: 'poster', paymentStatus: 'refunded', assignedTo: [worker] },
     cancelledAt Timestamp, cancelReason undefined; poster { penaltyPoints: 5, ratingScore: 4 }; application still 'accepted'; no worker_cancelled */
});
it('poster cancels an open job: cancelled, 0 points, no profile write', async () => { /* poster profile unchanged */ });
it('a legacy profile without ratingAverage: score from the old ratingScore', async () => { /* user { ratingScore: 4.2 } only; poster cancel -> ratingScore 3.7 */ });
it.each([['poster', CANCEL_MSG.workerConfirmed], ['worker', CANCEL_MSG.workerReported]])('%s after the worker reported completion is denied, escrow stays held', async () => {});
it('a disputed payment blocks both sides', async () => {});
it('the worker double-clicks: one succeeds, the other is permission-denied, penalty applied once', async () => {
  /* Promise.allSettled of two worker cancels -> one fulfilled, one rejected permission-denied; penaltyPoints 5; one notification */
});
it('a missing penalised profile: the cancel still happens, penaltyPoints 0, no users doc created', async () => {});
it.each([['outsider'], ['second assignee']])('%s is permission-denied and nothing changes', async () => {});
it.each([['completed', CANCEL_MSG.notCancellable], ['cancelled', CANCEL_MSG.alreadyCancelled]])('a %s job is failed-precondition', async () => {});
it('the worker without a reason is invalid-argument (reasonRequired); a junk reason is invalidReason', async () => {});
```

Then add a `describe('cancelJob callable (emulator)')`. It imports `cancelJob` dynamically in `beforeAll` after `connectEmulatorDb()`, and uses the `verifiedRequest` helper from `disputes.emulator.test.ts`. Tests:
- `the worker cancels through the callable` → `{ status: 'open' }`.
- `unverified / non-HCMUT / anonymous worker is permission-denied and the job stays in progress`.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/cancelJob.emulator.test.ts"`
Expected: FAIL, cannot resolve `src/handlers/cancelJob.js`.

- [ ] **Step 3: Implement `handleCancelJob`**

1. `parseCancelInput` runs outside the transaction.
2. Inside `db.runTransaction`, read the job, then call `cancelParties` (it throws before any other read).
3. Then read in parallel:
   - `jobCompletions/{jobId}`
   - `payments/{paymentIdFor(jobId, workerId)}`, only when `workerId` is set
   - `applications/{jobId}_{workerId}`, for the worker role only
4. Call `planCancel` with them, then read `users/{penalisedUid}` when it is set.
5. All reads happen before any write. Apply Decision 5 with `FieldValue.serverTimestamp()` and `FieldValue.arrayRemove`.
6. Return `{ notify, result }` from the transaction.
7. After the commit, a worker cancel calls `writeNotification` inside `try/catch` (`logger.error('cancelJob: notification failed after commit', …)`), as in `handlers/disputes.ts`.
8. Log the reason with `logger.info('cancelJob', { jobId, role, reason })`.

Add a doc comment that points at Decisions 4 and 5.

- [ ] **Step 4: Callable and its unit test**

`callables/cancelJob.ts`: `onCall({ region: REGION }, (request): Promise<CancelJobResult> => handleCancelJob(db, requireVerifiedMember(request), request.data))`.

`tests/unit/callables/cancelJob.test.ts`: copy `tests/unit/callables/confirmCompletion.test.ts`.
- The mocked handler resolves `{ penaltyPoints: 5, status: 'open' }`, and the data is `{ jobId: 'j1', reason: 'Khác' }`.
- Cover the region, the args passed (`({ fake: 'db' }, 'alice', data)`) and the four auth rejections before the handler.

- [ ] **Step 5: Run to verify it passes**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/cancelJob.emulator.test.ts"`
Expected: PASS.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/callables/cancelJob.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/functions/src/handlers/cancelJob.ts unijob-web/functions/src/callables/cancelJob.ts unijob-web/functions/tests/emulator/cancelJob.emulator.test.ts unijob-web/functions/tests/unit/callables/cancelJob.test.ts
git commit -m "feat(functions): add cancelJob callable with server penalties and escrow refund [task:5]"
```

---

### Task 6: Re-hold refunded escrow and pin the cancel flow through the existing triggers

**Depends on Tasks 3 and 5.** Only `handlers/payments.ts` changes in `src/`. If a flow test shows that `handlers/jobs.ts` or `handlers/applications.ts` misbehaves, fix the cancel handler instead and report it.

**Files:**

- Modify: `unijob-web/functions/src/handlers/payments.ts`
- Test: `unijob-web/functions/tests/emulator/payments.emulator.test.ts` (extend), `unijob-web/functions/tests/emulator/cancelFlow.emulator.test.ts` (create)

**Interfaces:**

- Consumes:
  - `handleCancelJob` (Task 5) and `handleJobCounters` (Task 3).
  - Existing: `handleJobUpdated`, `handleEscrow`, `handleApplicationUpdated`, `notificationsFor`.

- [ ] **Step 1: Write the failing escrow test**

In the `escrow hold on assignment` describe of `payments.emulator.test.ts`:

```ts
it('a refunded server payment for the same payee is held again on re-assignment', async () => {
  const { worker, jobId, before, after } = await assignedJob();
  await handleEscrowOnAssign(db, jobId, before, after);
  await db.doc(`payments/${jobId}_${worker}`).update({ status: 'refunded', refundedAt: Timestamp.now() });
  await expect(handleEscrowOnAssign(db, jobId, before, after)).resolves.toBe('created');
  const pay = (await paymentOf(jobId, worker)).data();
  expect(pay).toMatchObject({ status: 'held', releasedAt: null });
  expect(pay?.refundedAt).toBeUndefined();
  expect((await jobOf(jobId))?.paymentStatus).toBe('held');
});
it.each(['released', 'disputed'])('a %s server payment is kept (exists)', async (status) => { /* same setup, update status -> 'exists', status unchanged */ });
```

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/payments.emulator.test.ts"`
Expected: FAIL (the refunded case returns `'exists'`).

- [ ] **Step 2: Implement Decision 6**

- In `handleEscrowOnAssign`, return `'exists'` only when `paymentMatchesHeld(...) && paySnap.get('status') !== 'refunded'`.
- A refunded match falls through to the existing `tx.set`. Log `logger.info('escrow: re-holding a refunded payment', …)` instead of the "non-matching" warn.
- Update the doc comments of `handleEscrowOnAssign` and `handleEscrowOnJobUpdate`: cancellation refunds go through `cancelJob`. Remove the "KNOWN HOLE 6" sentence.

Run the same command. Expected: PASS.

- [ ] **Step 3: Write the flow test (`cancelFlow.emulator.test.ts`)**

Seed like Task 5's `inProgressJob({ held: true })`, plus `jobCounters/{jobId}` `{ activeWorker: worker, completedWorker: null }` and `activeJobCount: 1` on the worker. Take before/after snapshots of the job and the application around each `handleCancelJob`, and feed them to the existing handlers. Tests:
- `worker cancel`:
  - `handleJobUpdated` sends nothing (no `job_cancelled`).
  - `handleEscrow` returns `'skipped'`.
  - `handleApplicationUpdated` returns false (no `application_rejected`).
  - `handleJobCounters` drops `activeJobCount` to 0.
  - The worker has no notifications. The poster has only `worker_cancelled`.
- `poster cancel of an in-progress job`:
  - `job_cancelled` goes to the worker once.
  - `handleEscrow` returns `'skipped'` (the payment stays refunded).
  - `activeJobCount` is 0.
- `the same worker re-assigned after cancelling`:
  1. After the worker cancel, set the application back to `accepted` and the job to `{ status: 'in-progress', assignedTo: [worker] }` with the Admin db (simulating the poster's accept).
  2. `handleEscrow(before, after)` returns `'created'` and the payment is `held`.
  3. `handleJobCounters` brings `activeJobCount` back to 1.

- [ ] **Step 4: Run the flow test**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/cancelFlow.emulator.test.ts tests/emulator/payments.emulator.test.ts"`
Expected: PASS.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/handlers/payments.ts unijob-web/functions/tests/emulator/payments.emulator.test.ts unijob-web/functions/tests/emulator/cancelFlow.emulator.test.ts
git commit -m "fix(functions): re-hold refunded escrow on re-assignment and pin the cancel flow [task:6]"
```

---

### Task 7: Reputation backfill script (`scripts/recompute-reputation.mjs`)

**Depends on Tasks 1 and 3.** It runs in parallel with Tasks 2, 4, 5 and 6.

**Files:**

- Create: `unijob-web/scripts/recompute-reputation-plan.ts`, `unijob-web/scripts/recompute-reputation.mjs`
- Test: `unijob-web/tests/unit/scripts/recompute-reputation.test.ts`

**Interfaces:**

- Consumes: `aggregateRatings`, `currentCount`, `reputationScore` from `../functions/src/lib/reputation.ts` (Task 1, import-free). In the test only, `planCounters` from `functions/src/lib/counters.ts` (Task 3).
- Produces (in `recompute-reputation-plan.ts`, pure; Decision 10):
  - `interface ReputationFields { ratingAverage: number; totalRatings: number; ratingScore: number; penaltyPoints: number; activeJobCount: number; completedJobs: number }`
  - `interface JobIn { id: string; status: unknown; postedBy: unknown; assignedTo: unknown }`
  - `markerFor(job: JobIn): { activeWorker: string | null; completedWorker: string | null } | null`
    - In-progress job with a valid worker → `{ activeWorker: w, completedWorker: null }`.
    - Completed job with a valid worker → `{ activeWorker: null, completedWorker: w }`.
    - Otherwise `null`.
    - A valid worker is `assignedTo[0]` as a non-empty string without `/` that is not `postedBy`.
  - `planReputation(users: Array<{ id: string; data: Record<string, unknown> }>, ratings: Array<Record<string, unknown>>, jobs: JobIn[]): { userUpdates: Array<{ uid: string; set: ReputationFields; before: Partial<ReputationFields> }>; markers: Array<{ jobId: string } & NonNullable<ReturnType<typeof markerFor>>> }`
    - `userUpdates` only lists users whose stored values differ from `set`.
    - `markers` lists every non-null `markerFor`.
  - `chunk<T>(items: T[], size: number): T[][]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { planCounters } from '../../../functions/src/lib/counters.ts';
import { chunk, markerFor, planReputation } from '../../../scripts/recompute-reputation-plan.ts';

const users = [
  { id: 'w1', data: { ratingScore: 5, totalRatings: 9, activeJobCount: 7, completedJobs: 40 } }, // forged under the old rules
  { id: 'p1', data: { ratingScore: 4.2, penaltyPoints: 5 } },
];
const ratings = [
  { toUserId: 'w1', fromUserId: 'p1', score: 4 }, { toUserId: 'w1', fromUserId: 'p2', score: 5 },
  { toUserId: 'w1', fromUserId: 'w1', score: 5 }, { toUserId: 'ghost', fromUserId: 'p1', score: 1 },
];
const jobs = [
  { id: 'j1', status: 'in-progress', postedBy: 'p1', assignedTo: ['w1'] },
  { id: 'j2', status: 'completed', postedBy: 'p1', assignedTo: ['w1'] },
  { id: 'j3', status: 'completed', postedBy: 'p1', assignedTo: ['p1'] },
  { id: 'j4', status: 'open', postedBy: 'p1', assignedTo: [] },
  { id: 'j5', status: 'in-progress', postedBy: 'p1', assignedTo: ['a/b'] },
];

describe('planReputation', () => {
  it('recomputes forged profile values from ratings and jobs', () => {
    const plan = planReputation(users, ratings, jobs);
    expect(plan.userUpdates.find((u) => u.uid === 'w1')?.set).toEqual({ ratingAverage: 4.5, totalRatings: 2, ratingScore: 4.5, penaltyPoints: 0, activeJobCount: 1, completedJobs: 1 });
    expect(plan.userUpdates.find((u) => u.uid === 'p1')?.set).toEqual({ ratingAverage: 0, totalRatings: 0, ratingScore: 0, penaltyPoints: 5, activeJobCount: 0, completedJobs: 0 });
    expect(plan.userUpdates.map((u) => u.uid)).not.toContain('ghost'); // no profile is created
  });
  it('writes a counters marker for every in-progress or completed job with a valid worker', () => {
    expect(planReputation(users, ratings, jobs).markers).toEqual([
      { jobId: 'j1', activeWorker: 'w1', completedWorker: null },
      { jobId: 'j2', activeWorker: null, completedWorker: 'w1' },
    ]);
  });
  it('is idempotent: applying the plan and planning again lists no user', () => {
    const first = planReputation(users, ratings, jobs);
    const applied = users.map((u) => ({ id: u.id, data: { ...u.data, ...first.userUpdates.find((x) => x.uid === u.id)?.set } }));
    expect(planReputation(applied, ratings, jobs).userUpdates).toEqual([]);
  });
  it.each(jobs)('markerFor($id) agrees with the trigger rule (planCounters without a marker)', (job) => {
    expect(markerFor(job)).toEqual(planCounters(job.id, job, undefined)?.next ?? null);
  });
  it('chunk splits writes into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 400)).toEqual([]);
  });
});
```

Run: `cd unijob-web && npx vitest run tests/unit/scripts/recompute-reputation.test.ts`
Expected: FAIL, cannot resolve `scripts/recompute-reputation-plan.ts`.

- [ ] **Step 2: Implement the plan module**

`unijob-web/scripts/recompute-reputation-plan.ts` implements the Interfaces above, importing from `../functions/src/lib/reputation.ts` with the explicit `.ts` extension, as `migrate-applications.mjs` does for its plan.

If the web typecheck or lint rejects importing from `functions/src`, copy the three functions into the plan module instead. Then add a test in the same file asserting they equal the functions copies on the Task 1 fixtures, and say so in the commit body.

Run the same command. Expected: PASS.

- [ ] **Step 3: Implement the runner**

`unijob-web/scripts/recompute-reputation.mjs`: copy the structure of `migrate-applications.mjs`.

- Header comment with usage. `--apply` writes; the default is a dry-run.
- `scripts/service-account.json` must exist, else print the Vietnamese error used there and exit 1.
- `getFirestore('kirigitejkf8095h')`.
- Read `users`, `ratings` and `jobs` in parallel, then call `planReputation`.
- Print one line per user update (`users/{uid}: field before -> after`) and per marker, then `Summary: users=<n> markers=<n>`.
- Dry-run: print `Dry-run only. Re-run with --apply to write.` and exit 0.
- `--apply`:
  - User updates are `batch.update(users/{uid}, set)`.
  - Markers are `batch.set(jobCounters/{jobId}, { ...marker, updatedAt: FieldValue.serverTimestamp() })`.
  - Writes go through `chunk(writes, 400)`, committed sequentially.
- No unit test for the runner (as for `migrate-applications.mjs`). It is never run in CI.

- [ ] **Step 4: Run to verify**

Run: `cd unijob-web && npx vitest run tests/unit/scripts/recompute-reputation.test.ts && npx tsc --noEmit -p .`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS (including the secret scan; the script only references the gitignored path).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/scripts/recompute-reputation-plan.ts unijob-web/scripts/recompute-reputation.mjs unijob-web/tests/unit/scripts/recompute-reputation.test.ts
git commit -m "feat(scripts): add a one-off reputation and counters backfill [task:7]"
```

---

### Task 8: Export the new functions, document reputation and the deploy order

**Depends on Tasks 2, 3, 5, 6 and 7.**

**Files:**

- Modify: `unijob-web/functions/src/index.ts`, `unijob-web/functions/README.md`, `docs/backlog/security-holes.md`
- Test: `unijob-web/functions/tests/unit/index.test.ts`

**Interfaces:**

- Produces the deployable set: `cancelJob, confirmCompletion, disputePayment, expireJobs, onApplicationCreated, onApplicationUpdated, onJobCompletionWritten, onJobCounters, onJobEscrow, onJobUpdated, onRatingCreated, ping, sendJobInvite`.

- [ ] **Step 1: Write the failing test**

Add `'cancelJob'`, `'onJobCounters'` and `'onRatingCreated'` to the expected key list in `tests/unit/index.test.ts`.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/index.test.ts`
Expected: FAIL, three keys missing.

- [ ] **Step 2: Implement and document**

- `src/index.ts`: export `cancelJob` (`./callables/cancelJob.js`), `onJobCounters` (`./triggers/counters.js`) and `onRatingCreated` (`./triggers/ratings.js`).
- `README.md`:
  - In the `src/lib/` bullet, add "the reputation, counter and cancel rules in `reputation.ts`, `counters.ts` and `cancel.ts`".
  - Add `## Reputation and cancellation (slice 6)` after the completion section, with a three-row table:
    - `onRatingCreated`: retried; recomputes `ratingAverage` / `totalRatings` / `ratingScore`.
    - `onJobCounters`: retried; maintains `activeJobCount` / `completedJobs`, reconciled through `jobCounters/{jobId}`.
    - `cancelJob`: callable `{ jobId, reason? }` → `{ penaltyPoints, status }`, gated by `requireVerifiedMember`.
  - Below the table, document:
    - the score formula (Decision 1)
    - the penalty tiers (poster 5; worker 20 / 10 / 5)
    - the refund of held escrow
    - the denials (worker reported, disputed)
    - `worker_cancelled`
  - In "Deploying functions", add the slice 6 order (Decision 11), in one window:
    1. `--only functions` (6a).
    2. `--only hosting,firestore:rules` from the 6b branch.
    3. `cd unijob-web && node scripts/recompute-reputation.mjs`, review the dry-run, then `--apply`.

    State that deploying the 6b rules before these functions breaks cancellation for everyone.
- `docs/backlog/security-holes.md`:
  - Delete the "**Worker cancel**" and "**Cancel after the worker confirmed**" bullets (fixed server-side; 6b moves the client).
  - In pinned hole 1, add one sentence: "Since slice 6a the server path (`cancelJob`) refunds and penalises; 6b removes the direct client write."
  - Add the bullet "**cancelJob needs HCMUT accounts** — `requireVerifiedMember`; track with the `beforeUserCreated` item."
  - In "Before deploying these rules", add the paragraph **Reputation backfill.**
    - After the 6b rules are live, run `node scripts/recompute-reputation.mjs` (dry-run), then `--apply`.
    - It fixes profile values forged under the old `users.update` rule and writes `jobCounters` markers for in-progress and completed jobs.
    - It cannot recover cancel penalties lowered between the 6a and 6b deploys.

- [ ] **Step 3: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck && npm run build`
Expected: PASS, `lib/` emitted.

- [ ] **Step 4: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS. (`--full`, with the coverage gate, runs in uj-build's final CI. Each new `functions/src/` file must be at 70% or more.)

- [ ] **Step 5: Commit**

```bash
git add unijob-web/functions/src/index.ts unijob-web/functions/README.md unijob-web/functions/tests/unit/index.test.ts docs/backlog/security-holes.md
git commit -m "docs(functions): export reputation and cancel functions and document slice 6 [task:8]"
```

---

## Self-review notes

- **Design coverage:**
  - 6a.1 (rating recompute in a transaction, missing user skipped): Task 2.
  - 6a.2 (counters and their idempotency): Task 3. The mechanism is the state reconcile with a marker (Decision 3).
  - 6a.3 (cancelJob, every branch, the response, escrow re-hold): Tasks 4, 5 and 6.
  - 6a.4 (existing triggers on a worker cancel): Task 6.
  - 6a.5 (README, backlog): Task 8.
  - Field audit: Decision 2.
  - Coordinator follow-ups: parity relaxation (Decision 8, Task 4) and the backfill script (Decision 10, Task 7).
- **Names are consistent across tasks:**
  - Task 1: `reputationScore`, `currentAverage`, `currentCount`, `aggregateRatings`, `planPenalty`, `workerPenalty(deadlineMs, now)`, `POSTER_PENALTY`.
  - Task 2: `handleRatingCreated`, `onRatingCreated`.
  - Task 3: `countersRelevant`, `planCounters`, `CounterMarker`, `handleJobCounters`, `onJobCounters`.
  - Tasks 4 and 5: `CANCEL_MSG`, `CANCEL_REASONS`, `CancelReason`, `parseCancelInput`, `cancelParties`, `planCancel`, `CancelPlan`, `CancelJobResult`, `handleCancelJob`, `cancelJob`.
  - Task 7: `planReputation`, `markerFor`, `chunk`.
- **6b hand-off:**
  - The `callableError` allowlist needs the eight `CANCEL_MSG` strings plus `MSG_JOB_NOT_FOUND`, `MSG_NOT_MEMBER`, `MSG_NOT_VERIFIED` and `MSG_UNAUTHENTICATED`.
  - `users.update` locks `ratingScore`, `ratingAverage`, `totalRatings`, `penaltyPoints`, `activeJobCount`, `completedJobs` and `maxJobLimit`, and denies `xp`, `level`, `badges` and `role`.
  - `users.create` requires the auth.service defaults (`ratingScore` 0, `totalRatings` 0, `activeJobCount` 0, `maxJobLimit` 2), and that `ratingAverage`, `penaltyPoints` and `completedJobs` are absent.
  - New server-written fields: `cancelledBy` and `cancelledAt` on jobs, `withdrawnByWorker` on applications.
  - `worker_cancelled` goes into the web `NotificationType` and `NotificationBell`, and the parity test returns to strict equality.
- **The PR body must state:**
  - The deploy needs Blaze.
  - Deploy order, one window: the 6a functions, then the 6b hosting and rules, then the backfill script.
  - No App Check yet.
