---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-escrow-client
base: feat/server-escrow
slice: 4b (spec section 3, slice 4 "server escrow", client + rules half)
stacked-on: docs/plans/2026-10-25-server-escrow.md
---

# Client stops writing escrow (slice 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web client no longer creates, releases, refunds or disputes payments by writing Firestore. It reads its payment by the server's deterministic id and disputes through the `disputePayment` callable. The rules deny every client write to `payments` and to `jobs.paymentStatus`, which flips KNOWN HOLEs "the payee cannot release escrow to themselves", "clients cannot create payments for other people" and "poster cannot set paymentStatus directly".

**Architecture:** Plan 4a (stacked below this branch) makes Cloud Functions write `payments/{jobId}_{payeeId}` on accept (`onApplicationUpdated`), release it on `completed` (`onJobUpdated`), and dispute it via the `disputePayment` callable, which also notifies the other party (`payment_disputed`). This plan removes the client writes (`createPayment`, `releasePayment`, `refundPayment`, the Firestore `disputePayment`, `createEscrowForAccepted` in `job.service.ts`, the release block in `rating.service.ts`). It replaces the denied `where('jobId')` query with `getPaymentForJob` (deterministic `get` + legacy fallback), and adds `dispute.service.ts` (lazy `firebase/functions`) and a dispute form on the Payment page.

**Tech Stack:** React 19 + TypeScript, Firebase JS SDK (`firebase/firestore`, `firebase/functions`), Vitest (`unit`, `rules` projects), `@firebase/rules-unit-testing` on the Firestore emulator (`demo-unijob`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 4; testing rules in section 5). Design decisions: orchestrator slice-4 design, section "4b" (server contract in "4a").

All `Run:` lines are relative to the worktree root.

## Global Constraints

- Escrow is a ledger record only: no money moves, amounts are `jobs.payment` in VND.
- Server contract (4a): payment id `payments/{jobId}_{payeeId}` with `payeeId = job.assignedTo[0]`; fields `jobId, jobTitle, payerId, payeeId, amount, platformFee, netAmount, status, method 'platform_escrow', note, createdAt, heldAt, releasedAt, source 'server'`; dispute adds `disputedBy, disputedAt, disputeReason`.
- Callable `disputePayment`, region `asia-southeast1`, request `{ jobId: string; reason: string }`, response `{ disputed: true }`. Reason is trimmed, 10 to 500 characters (`String.prototype.length` after `trim()`). Only `held` payments can be disputed; a second call is `failed-precondition`. Known server message: `Chưa có thanh toán ký quỹ cho công việc này.` (`not-found`).
- New notification type `payment_disputed`.
- Callable errors arrive as `FirebaseError` with `code` `functions/<code>`. Show a server message verbatim only when it is in the known-message set; otherwise the local Vietnamese text for user-facing codes (`invalid-argument`, `not-found`, `permission-denied`, `failed-precondition`, `unauthenticated`); otherwise the fallback `Không thể gửi báo cáo tranh chấp, thử lại`.
- UI copy is Vietnamese. Services own Firestore/functions access; pages stay thin; types live in `src/types`.
- Keep `firebase/functions` out of the entry chunk (dynamic `import()`), or the `bundle-budget` gate fails.
- New unit tests go in `unijob-web/tests/unit/` mirroring `src/`; rules tests in `unijob-web/tests/rules/`. Never weaken a test: flipping a KNOWN HOLE means `it.fails` becomes `it` plus a sanity `assertSucceeds` in the same setup; a test asserting a client write that is now removed is replaced by a test asserting the write does not happen.
- New `src/services/**` and `src/lib/**` files need at least 70% line coverage (`dispute.service.ts`, `callableError.ts`; `payment.service.ts` too once it leaves `ci/coverage-legacy.json` in Task 3).
- Conventional Commits, message ends `[task:N]`, no `Co-Authored-By`. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact tree; Task 1 (rules) and the last task also run `node scripts/ci-local.mjs --full` (needs Java 11 or later).
- Do not change `unijob-web/functions/**`.

## Deploy order (goes in the PR body)

1. 4b rules first: `cd unijob-web && npx firebase deploy --only firestore:rules`.
2. Then 4a functions: `npx firebase deploy --only functions` (escrow triggers + `disputePayment`).
3. Last, 4b hosting: `npm run build` then `npx firebase deploy --only hosting`.
Rules first, hosting last (updated in Task 6; supersedes the earlier functions-first order).

## Decisions

1. **`getPaymentForJob(job, uid)` replaces `getPaymentByJob(jobId)`.** The rules deny the old `where('jobId','==',id)` query (rules are not filters: the query does not constrain `payerId`/`payeeId`), so real users only ever got errors from it. The new read is a `get` of `payments/{jobId}_{assignedTo[0]}`. If that is missing or denied, it falls back to legacy random-id payments with `where('jobId','==',id), where('payerId','==',uid)` and then `payeeId`, which the rules allow (equality only, no composite index needed).
2. **Legacy random-id payments stay readable but cannot be disputed from the UI.** The callable only looks at `payments/{jobId}_{assignedTo[0]}`, so a dispute on a legacy payment would fail with `not-found`. The Payment page hides the action for them and shows a "contact admin" line instead. The server never releases them; they go on the manual-review list.
3. **The dispute wrapper lives in a new `dispute.service.ts`, not in `payment.service.ts`.** `payment.service.ts` becomes Firestore-read-only (easy to guard), and the new file falls under the 70% coverage gate. The error mapping shared with `invite.service.ts` moves to `src/lib/callableError.ts` (DRY). `invite.service.ts` keeps its exported constants and behaviour, pinned by its unchanged tests.
4. **No client refund and no cancel-time refund.** `refundPayment` is deleted; held escrow on a cancelled job stays held until slice 6's `cancelJob` (KNOWN HOLE 6 is unchanged).
5. **`payment.service.ts` leaves `ci/coverage-legacy.json`.** After this plan it is small and fully unit-tested, so it can carry the 70% gate.

## File Structure

| File | Change | Task |
|---|---|---|
| `unijob-web/firestore.rules` | payments `create, update, delete: if false`; jobs poster update denies `paymentStatus` | 1 |
| `unijob-web/tests/rules/firestore.rules.test.ts` | flip 3 KNOWN HOLEs, new payments/paymentStatus tests | 1 |
| `docs/backlog/security-holes.md` | remove fixed holes and the `payments.update` bullet | 1 |
| `unijob-web/src/services/job.service.ts` | delete lazy `createPayment` + `createEscrowForAccepted` | 2 |
| `unijob-web/src/services/rating.service.ts` | delete the client release block | 2 |
| `unijob-web/tests/unit/services/{job,rating}.service.test.ts`, `rating.completion.test.ts` | follow the change, guard mocks | 2 |
| `unijob-web/src/services/payment.service.ts` | delete writes; `getPaymentForJob` | 3 |
| `unijob-web/src/pages/JobDetail.tsx`, `unijob-web/src/pages/Payment.tsx` (loader only) | use `getPaymentForJob` | 3 |
| `unijob-web/tests/unit/services/payment.service.test.ts` (create) | reads + source guard | 3 |
| `ci/coverage-legacy.json` | remove `payment.service.ts` | 3 |
| `docs/backlog/security-holes.md` ("Before deploying these rules") | legacy payments note | 3 |
| `unijob-web/src/lib/callableError.ts` (create) | `callableErrorMessage` | 4 |
| `unijob-web/src/services/invite.service.ts` | use `callableErrorMessage` | 4 |
| `unijob-web/src/services/dispute.service.ts` (create) | `disputePayment`, `validateDisputeReason`, `canDisputePayment`, `disputeErrorMessage` | 4 |
| `unijob-web/src/types/payment.ts`, `src/types/index.ts` | `DisputePaymentResult`, dispute fields | 4 |
| `unijob-web/src/types/notification.ts`, `src/components/layout/NotificationBell.tsx` | `payment_disputed` + icon | 4 |
| `unijob-web/tests/unit/lib/callableError.test.ts`, `tests/unit/services/dispute.service.test.ts` (create) | tests | 4 |
| `unijob-web/src/pages/Payment.tsx` | dispute form, dispute timeline row | 5 |
| `CHANGELOG.md` | Vietnamese entry | 5 |

## Parallelism

- **Tasks 1, 2 and 4** touch disjoint files and can run as parallel workers in separate worktrees cut from this branch.
- **Task 3** depends on Task 2 (`job.service.ts`/`rating.service.ts` must stop importing `createPayment`/`releasePayment`/`getPaymentByJob` before they are deleted). It edits a different section of `docs/backlog/security-holes.md` than Task 1.
- **Task 5** runs last: it needs Task 3's page loader and Task 4's `dispute.service.ts`.

## Review Focus

1. A legacy random-id payment (created by the old client before 4a): the page shows it, offers no "Báo tranh chấp" (the callable would answer `not-found`), and says to contact the admin. Pinned by `canDisputePayment` tests (Task 4) and its use in Task 5.
2. Someone who is neither payer nor payee opens `/jobs/:id/payment`, or the job has no assignee: the deterministic `get` is denied, both fallback queries are denied or empty, and the page shows "Chưa có thông tin thanh toán" instead of an endless spinner or a crash. Pinned in Task 3 (`getPaymentForJob` returns `null` on `permission-denied` and rethrows other errors; the page's `finally` clears loading).
3. A reason that is whitespace-only, 9 characters padded with spaces, or 501 characters: the client blocks it before calling, and sends the trimmed reason. Pinned by `validateDisputeReason` tests (Task 4).
4. A double click or a second dispute: the submit button is disabled while the call runs; a repeat after success gets the local `failed-precondition` text, never the raw code. Pinned by `disputeErrorMessage` tests (Task 4) and the `submitting` state (Task 5).
5. The callable not deployed yet (hosting before functions) or wrong region: the SDK error `functions/not-found` with message `not-found` shows the local Vietnamese text, never `not-found`. Pinned in Task 4.

---

### Task 1: Rules deny client payment writes and `paymentStatus` (flip 3 KNOWN HOLEs)

**Independent of Tasks 2 to 5.**

**Files:**
- Modify: `unijob-web/firestore.rules:59-64` (jobs poster update), `:252-264` (payments block)
- Modify: `unijob-web/tests/rules/firestore.rules.test.ts:302-304` (jobs KNOWN HOLE), `:622-640` (payments describe)
- Modify: `docs/backlog/security-holes.md` (sections "Pinned by `it.fails`" and "Not yet pinned by tests")

**Interfaces:**
- Consumes: nothing.
- Produces: `payments` writes denied for every client; poster updates touching `paymentStatus` denied. Reads unchanged (payer/payee only; payer/payee equality queries allowed).

- [ ] **Step 1: Change the tests first**

In `describe('jobs', ...)`, replace the KNOWN HOLE at lines 302-304 with:

```ts
  it('poster cannot set paymentStatus directly (only the server escrow writes it)', async () => {
    await seedJob('ps', { status: 'in-progress', assignedTo: ['carol'], paymentStatus: 'held' });
    const j = doc(as('poster'), 'jobs/ps');
    await assertFails(updateDoc(j, { paymentStatus: 'released' }));
    await assertFails(updateDoc(j, { paymentStatus: 'refunded', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { paymentStatus: deleteField() }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { paymentStatus: 'held' }));
    await assertFails(updateDoc(doc(as('carol'), 'jobs/ps'), { paymentStatus: 'released' }));
    // sanity: other poster edits on the same job still work while the server-set paymentStatus stays
    await assertSucceeds(updateDoc(j, { title: 'Mới', updatedAt: serverTimestamp() }));
  });
```

Keep `job create rejects paymentStatus and unknown keys` (it already pins the create side) and rename it `job create rejects paymentStatus (server-only) and unknown keys`.

Replace `describe('payments', ...)` (lines 622-640) with:

```ts
describe('payments', () => {
  // Since slice 4 only the server writes payments (escrow triggers, disputePayment callable).
  const pay = (uid: string, id = 'pay1') => doc(as(uid), `payments/${id}`);
  const forged = { jobId: 'job1', payerId: 'poster', payeeId: 'mallory', amount: 9_999_999, status: 'released' };

  it('a third party cannot read a payment', async () => {
    await assertFails(getDoc(pay('mallory')));
  });
  it('payer and payee can read the payment', async () => {
    await assertSucceeds(getDoc(pay('poster')));
    await assertSucceeds(getDoc(pay('worker')));
  });
  it('the payee cannot release escrow to themselves', async () => {
    await assertSucceeds(getDoc(pay('worker'))); // sanity: worker is the payee of pay1
    await assertFails(updateDoc(pay('worker'), { status: 'released' }));
    await assertFails(updateDoc(pay('worker'), { status: 'released', releasedAt: serverTimestamp() }));
  });
  it('clients cannot create payments for other people', async () => {
    await assertFails(setDoc(pay('mallory', 'forged'), forged));
    await assertFails(setDoc(pay('mallory', 'job1_mallory'), { ...forged, status: 'held' }));
    // sanity: the same document written server-side is valid and readable by its payee
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'payments/job1_mallory'), { ...forged, status: 'held', source: 'server' }),
    );
    await assertSucceeds(getDoc(pay('mallory', 'job1_mallory')));
  });
  it('the payload the old web client sent (createPayment) is denied, even for the payer', async () => {
    await assertFails(
      setDoc(pay('poster', 'job1_carol'), {
        jobId: 'job1', jobTitle: 'Nhập liệu', payerId: 'poster', payeeId: 'carol', amount: 100_000,
        platformFee: 5_000, netAmount: 95_000, status: 'held', method: 'platform_escrow', note: '',
        createdAt: serverTimestamp(), heldAt: serverTimestamp(), releasedAt: null,
      }),
    );
  });
  it('the payer cannot change status or amount', async () => {
    await assertSucceeds(getDoc(pay('poster'))); // sanity
    await assertFails(updateDoc(pay('poster'), { status: 'refunded' }));
    await assertFails(updateDoc(pay('poster'), { status: 'released' }));
    await assertFails(updateDoc(pay('poster'), { amount: 1 }));
  });
  it('neither side can mark a payment disputed directly (only the disputePayment callable)', async () => {
    await assertFails(updateDoc(pay('worker'), { status: 'disputed' }));
    await assertFails(updateDoc(pay('poster'), { status: 'disputed', disputeReason: 'Không làm đúng yêu cầu' }));
  });
  it('nobody deletes a payment', async () => {
    await assertSucceeds(getDoc(pay('poster'))); // sanity
    for (const uid of ['poster', 'worker', 'mallory']) await assertFails(deleteDoc(pay(uid)));
  });
  it('payer and payee can list their own payments (getPaymentsByUser, legacy fallback in getPaymentForJob)', async () => {
    const col = (uid: string) => collection(as(uid), 'payments');
    await assertSucceeds(getDocs(query(col('poster'), where('payerId', '==', 'poster'))));
    await assertSucceeds(getDocs(query(col('poster'), where('jobId', '==', 'job1'), where('payerId', '==', 'poster'))));
    await assertSucceeds(getDocs(query(col('worker'), where('jobId', '==', 'job1'), where('payeeId', '==', 'worker'))));
  });
  it('a jobId-only query is denied (rules are not filters), and a missing payment reads as denied', async () => {
    await assertFails(getDocs(query(collection(as('poster'), 'payments'), where('jobId', '==', 'job1'))));
    await assertFails(getDoc(pay('poster', 'job1_nobody')));
  });
});
```

- [ ] **Step 2: Run the rules tests to verify the new expectations fail**

Run: `cd unijob-web && npm run test:rules`
Expected: FAIL in exactly `poster cannot set paymentStatus directly…`, `the payee cannot release escrow…`, `clients cannot create payments…`, `the payload the old web client sent…`, `the payer cannot change status or amount`, `neither side can mark a payment disputed…`. The list/delete/read tests already pass.

- [ ] **Step 3: Change the rules**

`unijob-web/firestore.rules`, jobs poster branch (lines 63-64) becomes:

```
          // poster không sửa danh sách applicants, không đổi createdAt; paymentStatus chỉ server ghi (ký quỹ)
          && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['applicants', 'createdAt', 'paymentStatus'])
```

Payments block (lines 252-264) becomes:

```
    // PAYMENTS: payer hoặc payee mới đọc được. Mọi ghi (tạo ký quỹ, giải ngân, tranh chấp) do server
    // (Cloud Functions, Admin SDK) thực hiện; client không bao giờ được ghi.
    match /payments/{paymentId} {
      allow read: if isAuth() && (
        resource.data.payerId == request.auth.uid ||
        resource.data.payeeId == request.auth.uid
      );
      allow create, update, delete: if false;
    }
```

Update the jobs header comment line 24: `// open/in-progress -> cancelled, in-progress -> completed (TODO slice 5: chuyển sang server). paymentStatus chỉ server ghi.`

- [ ] **Step 4: Run the rules tests to verify they pass**

Run: `cd unijob-web && npm run test:rules`
Expected: PASS; the remaining `it.fails('KNOWN HOLE …')` (slice 5 completed, slice 5 rating, slice 6 cancel) still pass as expected failures.

- [ ] **Step 5: Update the backlog**

`docs/backlog/security-holes.md`:
- "Pinned by `it.fails`": delete items 1, 2 and 4; renumber the remaining ones 1 (`poster cannot mark a job completed directly`), 2 (`a poster-fabricated completion cannot unlock rating`), 3 (`poster cannot cancel an in-progress job while escrow is held`). Append to the new item 3: ` Since slice 4 the escrow is created and released server-side, but a cancel leaves it held: slice 6's cancelJob decides the refund.`
- "Not yet pinned by tests": delete the bullet **payments.update**.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests in full).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/firestore.rules unijob-web/tests/rules/firestore.rules.test.ts docs/backlog/security-holes.md
git commit -m "fix(rules): deny client payment writes and paymentStatus [task:1]"
```

---

### Task 2: job.service and rating.service stop writing escrow

**Independent of Tasks 1, 3, 4, 5.**

**Files:**
- Modify: `unijob-web/src/services/job.service.ts` (lines 24-32 lazy import, 213-237 `createEscrowForAccepted`, line 250, line 291, doc comments)
- Modify: `unijob-web/src/services/rating.service.ts` (line 16 import, lines 124-130 release block)
- Test: `unijob-web/tests/unit/services/job.service.test.ts`, `unijob-web/tests/unit/services/rating.service.test.ts`, `unijob-web/tests/unit/services/rating.completion.test.ts:19`

**Interfaces:**
- Consumes: nothing.
- Produces: unchanged signatures of `updateApplicationStatus`, `acceptApplication`, `confirmCompletion`. Neither `job.service.ts` nor `rating.service.ts` imports `@/services/payment.service` (statically or dynamically).

- [ ] **Step 1: Update the tests first**

`job.service.test.ts`:
- Line 29 becomes:

```ts
vi.mock('@/services/payment.service', () => {
  throw new Error('job.service must not import payment.service (the server creates the escrow)');
});
```

- Delete line 32 (`import { createPayment } …`).
- `acceptApplication` › `commits one batch …`: replace the `createPayment` expectation with `expect(getDoc).not.toHaveBeenCalled(); // no job/application reads for a client escrow`.
- `surfaces a commit failure and runs no side effects`: delete the `createPayment` line (the `getDoc` assertion stays).
- Replace `creates the escrow for the accepted application only, after commit; …` with:

```ts
    it('runs nothing after the commit (the server creates the escrow on accept)', async () => {
      await acceptApplication('j1', 'j1_u1', 'u1', ['j1_u2', 'j1_u3']);
      expect(batchOps.commit).toHaveBeenCalledTimes(1);
      expect(getDoc).not.toHaveBeenCalled();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(addDoc).not.toHaveBeenCalled();
    });
```

- `runs no side effects when the commit fails`: delete the `createPayment` line.
- Replace the three `updateApplicationStatus` tests with:

```ts
  it.each(['accepted', 'rejected'] as const)('%s only updates the application (no reads, no payment write)', async (status) => {
    await updateApplicationStatus('j1_u1', status);
    expect(callFor(vi.mocked(updateDoc), 'applications/j1_u1')?.[1]).toEqual({ status, updatedAt: 'SERVER_TS' });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(getDoc).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });
```

`rating.service.test.ts`:
- Line 18 becomes the throwing mock `vi.mock('@/services/payment.service', () => { throw new Error('rating.service must not import payment.service (the server releases the escrow)'); });`; delete line 26.
- Replace the `poster last: …` test with:

```ts
  it('poster last: confirms, records history, completes the job, writes no payment and no notification', async () => {
    vi.mocked(getDoc).mockResolvedValue(completion({ workerConfirmed: true }) as never);
    vi.mocked(getJobById).mockResolvedValue({ id: 'j1', title: 'T', category: 'it', postedBy: 'p', assignedTo: ['w'] } as never);
    await confirmCompletion('c1', 'poster');
    expect(updateDoc).toHaveBeenCalledWith({ _path: 'jobCompletions/c1' }, { posterConfirmed: true, status: 'confirmed', completedAt: 'SERVER_TS' });
    expect(recordWorkHistory).toHaveBeenCalledWith('p', 'w', 'j1', 'T', 'it');
    expect(updateJob).toHaveBeenCalledTimes(1);
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'completed' }); // no paymentStatus: the server releases on completed
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).not.toHaveBeenCalled();
  });
```

`rating.completion.test.ts` line 19: same throwing mock as `rating.service.test.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/job.service.test.ts tests/unit/services/rating.service.test.ts tests/unit/services/rating.completion.test.ts`
Expected: FAIL: "must not import payment.service" (rating.service imports it statically; job.service imports it on accept) and `getDoc` called after the accept commit.

- [ ] **Step 3: Implement**

`job.service.ts`: delete lines 24-32 (the lazy `_createPayment`/`getCreatePayment`) and `createEscrowForAccepted` (lines 213-237). `updateApplicationStatus` ends after its `updateDoc`; `acceptApplication` ends after `await batch.commit();`. In the doc comment of `acceptApplication`, replace the last line with `Notifications and the escrow payment are created by Cloud Functions (onApplicationUpdated).` Above `updateApplicationStatus` add `// Accept: the escrow payment is created server-side (onApplicationUpdated trigger).`

`rating.service.ts`: delete line 16 and the `// Tự động giải phóng tiền ký quỹ cho worker` try/catch (lines 124-130). Replace it with the comment `// Tiền ký quỹ do Cloud Function onJobUpdated giải ngân khi job chuyển sang 'completed'.`

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services && npx tsc -b`
Expected: PASS, typecheck clean (`payment.service.ts` still exports the old writers until Task 3; nothing calls them).

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/job.service.ts unijob-web/src/services/rating.service.ts unijob-web/tests/unit/services/job.service.test.ts unijob-web/tests/unit/services/rating.service.test.ts unijob-web/tests/unit/services/rating.completion.test.ts
git commit -m "refactor(services): stop creating and releasing escrow from the client [task:2]"
```

---

### Task 3: payment.service becomes read-only; `getPaymentForJob`

**Depends on Task 2.**

**Files:**
- Modify: `unijob-web/src/services/payment.service.ts` (whole file)
- Modify: `unijob-web/src/pages/JobDetail.tsx:5, 50-62`
- Modify: `unijob-web/src/pages/Payment.tsx:4, 74-82` (loader only)
- Modify: `ci/coverage-legacy.json` (remove `"unijob-web/src/services/payment.service.ts",`)
- Modify: `docs/backlog/security-holes.md` (end of "Before deploying these rules")
- Test (create): `unijob-web/tests/unit/services/payment.service.test.ts`

**Interfaces:**
- Consumes: Task 2 removed every caller of `createPayment`, `releasePayment`, `getPaymentByJob`.
- Produces:
  - `getPaymentForJob(job: Pick<Job, 'id' | 'assignedTo'>, uid: string): Promise<Payment | null>`
  - unchanged `getPaymentById(paymentId: string): Promise<Payment | null>`, `getPaymentsByUser(userId: string): Promise<Payment[]>`
  - `payment.service.ts` exports exactly those three.

- [ ] **Step 1: Write the failing test**

`unijob-web/tests/unit/services/payment.service.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ _col: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((_c: unknown, ...w: unknown[]) => ({ _where: w })),
  where: vi.fn((f: string, op: string, v: unknown) => `${f}${op}${String(v)}`),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/job.service', () => {
  throw new Error('payment.service must not import job.service');
});

import { getDoc, getDocs } from 'firebase/firestore';
import * as service from '@/services/payment.service';
import { getPaymentForJob, getPaymentsByUser } from '@/services/payment.service';

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const snap = (id: string, data: Record<string, unknown> | null) => ({ id, exists: () => data !== null, data: () => data });
const qs = (...docs: { id: string; data: Record<string, unknown> }[]) => ({
  empty: docs.length === 0,
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});
const whereCalls = () => vi.mocked(getDocs).mock.calls.map((c) => (c[0] as unknown as { _where: string[] })._where);

beforeEach(() => vi.clearAllMocks());

describe('payment.service exports', () => {
  it('only reads payments (the server creates, releases and disputes them)', () => {
    expect(Object.keys(service).sort()).toEqual(['getPaymentById', 'getPaymentForJob', 'getPaymentsByUser']);
  });
});

describe('getPaymentForJob', () => {
  const job = { id: 'j1', assignedTo: ['w'] };

  it('reads the server payment payments/{jobId}_{payee} and does not query', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('j1_w', { jobId: 'j1', status: 'held' }) as never);
    await expect(getPaymentForJob(job, 'p')).resolves.toEqual({ id: 'j1_w', jobId: 'j1', status: 'held' });
    expect(getDoc).toHaveBeenCalledWith({ _path: 'payments/j1_w' });
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('falls back to a legacy payment as payer, then as payee, newest first', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied() as never);
    vi.mocked(getDocs)
      .mockResolvedValueOnce(qs() as never)
      .mockResolvedValueOnce(
        qs(
          { id: 'old', data: { jobId: 'j1', createdAt: { seconds: 1 } } },
          { id: 'new', data: { jobId: 'j1', createdAt: { seconds: 2 } } },
        ) as never,
      );
    await expect(getPaymentForJob(job, 'w')).resolves.toMatchObject({ id: 'new' });
    expect(whereCalls()).toEqual([
      ['jobId==j1', 'payerId==w'],
      ['jobId==j1', 'payeeId==w'],
    ]);
  });

  it('skips the get when the job has no assignee, and returns null when nothing is found', async () => {
    vi.mocked(getDocs).mockResolvedValue(qs() as never);
    await expect(getPaymentForJob({ id: 'j1', assignedTo: [] }, 'p')).resolves.toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('returns null for an outsider (every read denied)', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied() as never);
    vi.mocked(getDocs).mockRejectedValue(denied() as never);
    await expect(getPaymentForJob(job, 'mallory')).resolves.toBeNull();
  });

  it('returns null without reading when there is no signed-in uid', async () => {
    await expect(getPaymentForJob(job, '')).resolves.toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('rethrows errors other than permission-denied', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }) as never);
    await expect(getPaymentForJob(job, 'p')).rejects.toThrow('offline');
  });
});

describe('getPaymentsByUser', () => {
  it('merges payer and payee payments without duplicates, newest first', async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(qs({ id: 'a', data: { createdAt: { seconds: 1 } } }, { id: 'b', data: { createdAt: { seconds: 3 } } }) as never)
      .mockResolvedValueOnce(qs({ id: 'b', data: { createdAt: { seconds: 3 } } }) as never);
    const res = await getPaymentsByUser('u');
    expect(res.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

const SRC = join(process.cwd(), 'src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no client code writes payments', () => {
  const files = sourceFiles(SRC);
  it.each(files.map((f) => [relative(SRC, f), f]))('%s never calls the removed escrow writers or writes paymentStatus', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(createPayment|releasePayment|refundPayment|getPaymentByJob|createEscrowForAccepted)\b/);
    expect(text).not.toMatch(/paymentStatus\s*:/); // the type declares `paymentStatus?:`, writes would be `paymentStatus:`
  });
  it('payment.service.ts has no Firestore write API', () => {
    const text = readFileSync(join(SRC, 'services', 'payment.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/payment.service.test.ts`
Expected: FAIL: "payment.service must not import job.service", then exports and source-guard failures.

- [ ] **Step 3: Implement**

`payment.service.ts`: delete `createPayment`, `releasePayment`, `refundPayment`, `disputePayment`, `getPaymentByJob`, the `calculatePlatformFee` import/re-export (no caller; the server computes the fee), and the `job.service`/`addDoc`/`serverTimestamp`/`updateDoc` imports. Add above `paymentsCollection`: `// Ký quỹ do Cloud Functions ghi (rules cấm client ghi payments). Client chỉ đọc; tranh chấp qua dispute.service.`

Add `getPaymentForJob(job: Pick<Job, 'id' | 'assignedTo'>, uid: string): Promise<Payment | null>`:
1. `if (!uid) return null`.
2. If `job.assignedTo?.[0]` exists: `getDoc(doc(db, 'payments', `${job.id}_${payee}`))`; return `{ id, ...data }` when it exists. A `permission-denied` error (missing doc or not a party) continues to step 3; any other error is rethrown.
3. For `field` in `['payerId', 'payeeId']` (in that order): `getDocs(query(paymentsCollection, where('jobId', '==', job.id), where(field, '==', uid)))`; if not empty, return the doc with the largest `createdAt.seconds` (missing = 0). `permission-denied` continues; other errors rethrow.
4. Return `null`.

Use a small local `isPermissionDenied(err: unknown): boolean` (`(err as { code?: unknown })?.code === 'permission-denied'`).

`JobDetail.tsx`: line 5 imports `getPaymentForJob`; delete line 60; add a separate effect after the first one:

```tsx
  const paymentJobId = job?.id;
  const paymentPayee = job?.assignedTo?.[0];
  useEffect(() => {
    if (!paymentJobId || !userProfile?.uid) return;
    getPaymentForJob({ id: paymentJobId, assignedTo: paymentPayee ? [paymentPayee] : [] }, userProfile.uid)
      .then(setPayment)
      .catch(() => {});
  }, [paymentJobId, paymentPayee, userProfile?.uid]);
```

`Payment.tsx`: line 4 imports `getPaymentForJob`. Replace the effect (lines 74-82) with a `useCallback` loader `loadPayment` (deps `[jobId, uid]` with `const uid = userProfile?.uid ?? ''`). It does `const j = await getJobById(jobId); setJob(j); setPayment(j ? await getPaymentForJob(j, uid) : null);` inside `try/catch` (on error: `setPayment(null)`) and `finally { setLoading(false) }`. Then `useEffect(() => { void loadPayment(); }, [loadPayment]);`. Task 5 reuses `loadPayment` after a dispute.

`ci/coverage-legacy.json`: remove the `payment.service.ts` line.

`docs/backlog/security-holes.md`, append to the end of "Before deploying these rules":

```markdown

**Legacy payments.** Before slice 4 the client created payments with random ids (`addDoc`), and could release them itself. Since slice 4 the server only creates, releases and disputes `payments/{jobId}_{payeeId}`. Legacy random-id payments stay readable for payer and payee (`getPaymentForJob` falls back to `where('jobId')` + `where('payerId'|'payeeId')`), but they are never released, refunded or disputable server-side. Before deploying, list every `payments` doc whose id is not `{jobId}_{payeeId}` (and those created between the functions deploy and the hosting deploy, when old tabs could still create them) for manual review. A job may then have both a legacy and a server payment; the client shows the server one.
```

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/pages/JobDetail.tsx src/pages/Payment.tsx src/services/payment.service.ts`
Expected: PASS, clean (no `react-hooks/exhaustive-deps` warning).

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS, including coverage (`payment.service.ts` at 70% or more now that it is no longer legacy).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/payment.service.ts unijob-web/src/pages/JobDetail.tsx unijob-web/src/pages/Payment.tsx unijob-web/tests/unit/services/payment.service.test.ts ci/coverage-legacy.json docs/backlog/security-holes.md
git commit -m "refactor(payments): read payments by the server id and drop client escrow writes [task:3]"
```

---

### Task 4: `dispute.service` (callable wrapper) and `payment_disputed` type

**Independent of Tasks 1, 2, 3.**

**Files:**
- Create: `unijob-web/src/lib/callableError.ts`
- Modify: `unijob-web/src/services/invite.service.ts:7, 48-60` (use the helper; keep every export)
- Create: `unijob-web/src/services/dispute.service.ts`
- Modify: `unijob-web/src/types/payment.ts`, `unijob-web/src/types/index.ts:5`
- Modify: `unijob-web/src/types/notification.ts:3-11`, `unijob-web/src/components/layout/NotificationBell.tsx:24-33`
- Test (create): `unijob-web/tests/unit/lib/callableError.test.ts`, `unijob-web/tests/unit/services/dispute.service.test.ts`

**Interfaces:**
- Consumes: callable `disputePayment` (4a), default export `app` of `@/lib/firebase`, `Payment` type.
- Produces:
  - `src/lib/callableError.ts`: `type UserFacingCode = 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition' | 'unauthenticated'`; `callableErrorMessage(err: unknown, opts: { codeMessages: Readonly<Record<UserFacingCode, string>>; serverMessages: ReadonlySet<string>; fallback: string }): string` (same algorithm as today's `inviteErrorMessage`).
  - `src/types/payment.ts`: `interface DisputePaymentResult { disputed: true }`; `Payment` gains optional `disputedBy?: string; disputedAt?: Timestamp; disputeReason?: string; source?: 'server'`. Exported from `@/types`.
  - `src/services/dispute.service.ts`: `DISPUTE_REASON_MIN = 10`, `DISPUTE_REASON_MAX = 500`, `DISPUTE_FALLBACK_ERROR = 'Không thể gửi báo cáo tranh chấp, thử lại'`, `DISPUTE_CODE_MESSAGES`, `DISPUTE_SERVER_MESSAGES`, `validateDisputeReason(reason: string): string | null`, `canDisputePayment(payment: Pick<Payment, 'id' | 'jobId' | 'payerId' | 'payeeId' | 'status'>, uid: string | undefined): boolean`, `disputePayment(jobId: string, reason: string): Promise<DisputePaymentResult>`, `disputeErrorMessage(err: unknown): string`.
  - `NotificationType` includes `'payment_disputed'`.

- [ ] **Step 1: Collect the exact server messages**

Run (read-only): `git show feat/server-escrow:unijob-web/functions/src/handlers/payments.ts` and `git show feat/server-escrow:unijob-web/functions/src/lib/auth.ts`.
Note every Vietnamese string that `disputePayment` and `requireVerifiedMember` throw as `HttpsError`. They form `DISPUTE_SERVER_MESSAGES`, which must contain at least `Chưa có thanh toán ký quỹ cho công việc này.`, `Không tìm thấy công việc.` and `Bạn cần đăng nhập để thực hiện thao tác này.` If the branch is not available, use exactly these three and say so in the commit body.

- [ ] **Step 2: Write the failing tests**

`unijob-web/tests/unit/lib/callableError.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { callableErrorMessage } from '@/lib/callableError';

const opts = {
  codeMessages: {
    'invalid-argument': 'A', 'not-found': 'B', 'permission-denied': 'C', 'failed-precondition': 'D', unauthenticated: 'E',
  },
  serverMessages: new Set(['Thông điệp server.']),
  fallback: 'F',
};

describe('callableErrorMessage', () => {
  it('passes a known server message through for a user-facing code', () => {
    expect(callableErrorMessage({ code: 'functions/not-found', message: 'Thông điệp server.' }, opts)).toBe('Thông điệp server.');
  });
  it('uses the local text for a user-facing code with an unknown message', () => {
    expect(callableErrorMessage({ code: 'functions/not-found', message: 'not-found' }, opts)).toBe('B');
    expect(callableErrorMessage({ code: 'functions/unauthenticated', message: '' }, opts)).toBe('E');
  });
  it.each([
    { code: 'functions/internal', message: 'Thông điệp server.' },
    { code: 'functions/constructor', message: 'x' },
    { code: 'permission-denied', message: 'Thông điệp server.' },
    new Error('network'),
    null,
    undefined,
    'boom',
  ])('falls back for %j', (err) => {
    expect(callableErrorMessage(err, opts)).toBe('F');
  });
});
```

`unijob-web/tests/unit/services/dispute.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP' }));

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  DISPUTE_CODE_MESSAGES,
  DISPUTE_FALLBACK_ERROR,
  DISPUTE_SERVER_MESSAGES,
  canDisputePayment,
  disputeErrorMessage,
  disputePayment,
  validateDisputeReason,
} from '@/services/dispute.service';

beforeEach(() => vi.clearAllMocks());

describe('disputePayment', () => {
  it('calls disputePayment in asia-southeast1 with the trimmed reason', async () => {
    callable.mockResolvedValue({ data: { disputed: true } });
    await expect(disputePayment('j1', '  Không làm đúng yêu cầu  ')).resolves.toEqual({ disputed: true });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'disputePayment');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', reason: 'Không làm đúng yêu cầu' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(disputePayment('j1', 'Lý do đủ dài ở đây')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

describe('validateDisputeReason', () => {
  it.each(['', '          ', '123456789', '   123456789   '])('rejects %j as too short', (r) => {
    expect(validateDisputeReason(r)).toBe('Lý do cần ít nhất 10 ký tự.');
  });
  it('rejects more than 500 characters after trimming', () => {
    expect(validateDisputeReason('a'.repeat(501))).toBe('Lý do tối đa 500 ký tự.');
  });
  it.each(['1234567890', `  ${'a'.repeat(500)}  `])('accepts %j', (r) => {
    expect(validateDisputeReason(r)).toBeNull();
  });
});

describe('canDisputePayment', () => {
  const p = { id: 'j1_w', jobId: 'j1', payerId: 'p', payeeId: 'w', status: 'held' as const };
  it('allows payer and payee on a held server payment', () => {
    expect(canDisputePayment(p, 'p')).toBe(true);
    expect(canDisputePayment(p, 'w')).toBe(true);
  });
  it.each([
    ['an outsider', p, 'x'],
    ['no user', p, undefined],
    ['a released payment', { ...p, status: 'released' as const }, 'p'],
    ['an already disputed payment', { ...p, status: 'disputed' as const }, 'p'],
    ['a legacy random-id payment', { ...p, id: 'AbC123random' }, 'p'],
  ])('denies %s', (_name, payment, uid) => {
    expect(canDisputePayment(payment, uid)).toBe(false);
  });
});

describe('disputeErrorMessage', () => {
  it('passes every known server message through', () => {
    expect(DISPUTE_SERVER_MESSAGES.has('Chưa có thanh toán ký quỹ cho công việc này.')).toBe(true);
    for (const message of DISPUTE_SERVER_MESSAGES) {
      expect(disputeErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(disputeErrorMessage(err)).toBe(DISPUTE_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(DISPUTE_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(DISPUTE_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(disputeErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(DISPUTE_FALLBACK_ERROR);
    expect(disputeErrorMessage(new Error('network'))).toBe(DISPUTE_FALLBACK_ERROR);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/lib/callableError.test.ts tests/unit/services/dispute.service.test.ts`
Expected: FAIL, cannot resolve `@/lib/callableError` and `@/services/dispute.service`.

- [ ] **Step 4: Implement**

- `src/lib/callableError.ts`: move the body of today's `inviteErrorMessage` into `callableErrorMessage(err, opts)` (use `Object.hasOwn(opts.codeMessages, short)`, so `functions/constructor` falls back). Export `UserFacingCode`.
- `invite.service.ts`: import `UserFacingCode` and `callableErrorMessage` from `@/lib/callableError` (delete the local type). `inviteErrorMessage(err)` returns `callableErrorMessage(err, { codeMessages: INVITE_CODE_MESSAGES, serverMessages: INVITE_SERVER_MESSAGES, fallback: INVITE_FALLBACK_ERROR })`. `tests/unit/services/invite.service.test.ts` stays unchanged and must pass.
- `src/types/payment.ts`: add the fields and `DisputePaymentResult` from Interfaces; `src/types/index.ts` line 5 also exports `DisputePaymentResult`.
- `src/services/dispute.service.ts`, structured like `invite.service.ts`: lazy `await import('firebase/functions')`, `httpsCallable<{ jobId: string; reason: string }, DisputePaymentResult>(getFunctions(app, 'asia-southeast1'), 'disputePayment')`, sends `reason.trim()`. Exact copy:

```ts
export const DISPUTE_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Lý do tranh chấp phải dài từ 10 đến 500 ký tự.',
  'not-found': 'Không tìm thấy công việc hoặc khoản ký quỹ.',
  'permission-denied': 'Bạn không có quyền báo tranh chấp cho công việc này.',
  'failed-precondition': 'Khoản thanh toán này không còn ở trạng thái ký quỹ.',
  unauthenticated: 'Bạn cần đăng nhập để báo tranh chấp.',
};
```

  `validateDisputeReason`: on `reason.trim().length`, `< 10` → `'Lý do cần ít nhất 10 ký tự.'`, `> 500` → `'Lý do tối đa 500 ký tự.'`, else `null`.
  `canDisputePayment`: `!!uid && payment.status === 'held' && (uid === payment.payerId || uid === payment.payeeId) && payment.id === `${payment.jobId}_${payment.payeeId}``.
- `src/types/notification.ts`: add `| 'payment_disputed'` to `NotificationType`; `NotificationBell.tsx` `iconByType` gains `payment_disputed: '⚠️',`.

- [ ] **Step 5: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/lib/callableError.ts src/services/dispute.service.ts src/services/invite.service.ts src/components/layout/NotificationBell.tsx`
Expected: PASS (including the unchanged `invite.service.test.ts`), clean.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS, coverage of `dispute.service.ts` and `callableError.ts` at 70% or more.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/src/lib/callableError.ts unijob-web/src/services/invite.service.ts unijob-web/src/services/dispute.service.ts unijob-web/src/types/payment.ts unijob-web/src/types/index.ts unijob-web/src/types/notification.ts unijob-web/src/components/layout/NotificationBell.tsx unijob-web/tests/unit/lib/callableError.test.ts unijob-web/tests/unit/services/dispute.service.test.ts
git commit -m "feat(payments): add the disputePayment callable client and payment_disputed type [task:4]"
```

---

### Task 5: Dispute form on the Payment page, CHANGELOG

**Depends on Tasks 3 and 4.**

**Files:**
- Modify: `unijob-web/src/pages/Payment.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `loadPayment` (Task 3, in the page), `canDisputePayment`, `validateDisputeReason`, `disputePayment`, `disputeErrorMessage`, `DISPUTE_REASON_MAX` (Task 4), `Payment.disputedAt`, `Payment.disputeReason`.
- Produces: UI only.

- [ ] **Step 1: Implement the dispute section**

In `Payment.tsx` (state: `showDispute`, `reason`, `submitting`; `const reasonError = validateDisputeReason(reason)`):
- Below the "Role info" block, when `canDisputePayment(payment, userProfile?.uid)`: a button `Báo tranh chấp` (red outline, `AlertTriangle` icon) that toggles a form. The form has a `<textarea maxLength={DISPUTE_REASON_MAX + 50}>` (placeholder `Mô tả vấn đề (10–500 ký tự)…`), a counter `{reason.trim().length}/500`, the inline `reasonError` shown only once `reason` is non-empty, a hint `Bên kia sẽ nhận được thông báo. Khoản ký quỹ sẽ được tạm giữ cho đến khi được xử lý.`, and buttons `Hủy` / `Gửi báo cáo` (disabled while `submitting || reasonError !== null`).
- Submit: `setSubmitting(true)`; `await disputePayment(job.id, reason)`. On success: `toast.success('Đã gửi báo cáo tranh chấp. Bên kia sẽ được thông báo.')`, reset the form, `await loadPayment()`. On error: `toast.error(disputeErrorMessage(err))` and keep the form open. `finally setSubmitting(false)`.
- When `(isPayer || isPayee) && payment.status === 'held' && !canDisputePayment(payment, userProfile?.uid)` (legacy random-id payment): show the line `Giao dịch tạo trước khi nâng cấp hệ thống — vui lòng liên hệ quản trị viên nếu có tranh chấp.`
- When `payment.status === 'disputed'` and `payment.disputeReason` is set: show `Lý do: {payment.disputeReason}` in the status card (plain text node, React escapes it).
- Timeline: a row `Báo tranh chấp` with `formatTs(payment.disputedAt)` when `payment.disputedAt` is set.
- Import `toast` from `react-hot-toast` (other pages already use it).

- [ ] **Step 2: Verify**

Run: `cd unijob-web && npx tsc -b && npx eslint src/pages/Payment.tsx && npx vitest run --project unit`
Expected: clean, PASS.

- [ ] **Step 3: CHANGELOG**

Under `## [Unreleased]`:
- `### Added`: `- Ký quỹ phía server: khi người đăng chấp nhận ứng viên, Cloud Function tạo bản ghi ký quỹ \`payments/{jobId}_{người làm}\` (chỉ là sổ ghi, chưa chuyển tiền thật) và giải ngân khi job hoàn thành. Người đăng hoặc người làm có thể "Báo tranh chấp" trên trang thanh toán (callable \`disputePayment\`, lý do 10–500 ký tự); bên kia nhận thông báo.`
- `### Security`: `- Client không còn tạo, giải ngân, hoàn tiền hay đánh dấu tranh chấp thanh toán (rules chặn mọi ghi vào \`payments\` và \`jobs.paymentStatus\`). Trang thanh toán đọc theo id của server; giao dịch cũ (id ngẫu nhiên) vẫn xem được nhưng cần quản trị viên rà soát. Deploy functions trước, rồi hosting + rules.`

- [ ] **Step 4: Local CI (full: whole branch before push)**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests, functions-tests, coverage, build, `bundle-budget` with `firebase/functions` still in a lazy chunk).

- [ ] **Step 5: Commit**

```bash
git add unijob-web/src/pages/Payment.tsx CHANGELOG.md
git commit -m "feat(payments): let payer and payee report a dispute from the payment page [task:5]"
```

---

## Self-review notes

- Design 4b coverage: rules payments (Task 1, item 1), jobs `paymentStatus` + create pin (Task 1, item 2), payment.service reads and `getPaymentForJob` with legacy fallback + callers (Task 3, item 3), `disputePayment` wrapper + error mapping + Payment page action (Tasks 4, 5, item 4), job/rating writes removed with guard mocks and a source guard (Tasks 2, 3, item 5), `payment_disputed` type + icon (Task 4, item 6), backlog and CHANGELOG (Tasks 1, 3, 5, item 7), deploy order functions first (Deploy order, item 8).
- Names match 4a: callable `disputePayment`, region `asia-southeast1`, `{ jobId, reason }` to `{ disputed: true }`, id `{jobId}_{payeeId}`, `payment_disputed`.
- KNOWN HOLE 6 (cancel while held) stays an `it.fails`; its backlog entry notes that cancel leaves the escrow held.
- PR body: base branch `feat/server-escrow`, deploy order, old-tab behaviour, legacy payments review list.
