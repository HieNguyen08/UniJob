---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-escrow
base: main
slice: 4a (spec section 3, slice 4 "server escrow", Cloud Functions half)
stacked-next: feat/server-escrow-client (slice 4b: client + rules)
---

# Server escrow (slice 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The escrow ledger is written server-side: accepting an application creates `payments/{jobId}_{payeeId}` (status `held`) and sets `jobs.paymentStatus`, a job reaching `completed` releases it, and a new callable `disputePayment` lets the poster or the worker freeze a held payment and notifies the other party. Additive only: no web client, no rules change (that is 4b).

**Architecture:** Same shape as slice 3. Pure, Admin-free handlers in `functions/src/handlers/payments.ts` (accept + release) and `functions/src/handlers/disputes.ts` (dispute) take `(db, ids, data)`; every state change is one Firestore transaction (all reads before writes). The existing `onApplicationUpdated` and `onJobUpdated` triggers run the notification handler and the escrow handler side by side through `settleAll`, so one failing never skips the other and the trigger never throws. `disputePayment` is a thin `onCall` wrapper that authorises with the new `requireVerifiedMember`.

**Tech Stack:** firebase-functions 7.4.0 (v2 `firestore`, `https`), firebase-admin 14.5.0, TypeScript 5.9, Vitest 5 (projects `unit` and `emulator`), Firestore emulator (project `demo-unijob`, database `kirigitejkf8095h`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 4; decisions table section 2; error handling section 4). The orchestrator's design notes for 4a are folded into "Decisions" below.

All `Run:` lines are relative to the worktree root (the directory that contains `unijob-web/` and `scripts/`).

## Global Constraints

- Region `asia-southeast1` (`REGION`), database `kirigitejkf8095h` (`DATABASE_ID`), both from `src/config.ts`. Never hard-code either string in `src/`.
- Emulator project id is always `demo-unijob`. Emulator tests connect only through `connectEmulatorDb()` (`functions/tests/support/emulatorDb.ts`).
- The escrow is a **ledger record only**: no money moves, no payment provider. `amount` is `jobs.payment` (VND, integer).
- Payment doc id is `${jobId}_${payeeId}`. Triggers log and never throw on duplicate or malformed events (spec section 4).
- Callables throw `HttpsError` with Vietnamese messages (`unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `failed-precondition`). All user-facing copy is Vietnamese.
- User text stored or shown by the server (job titles, dispute reasons) goes through `safeText` + `clip` (`src/lib/messages.ts`).
- New `functions/src/**` files need at least 70% line coverage (`ci-local --full` coverage gate, unit + emulator projects together). Do not lower any threshold.
- Tests live in `unijob-web/functions/tests/unit/**` and `unijob-web/functions/tests/emulator/**`, never next to source. `firebase-functions-test` is not used: call v2 functions via `.run(...)`.
- Do not touch `unijob-web/src/**`, `unijob-web/firestore.rules` or `unijob-web/tests/**` (that is 4b).
- Conventional Commits, message ends with `[task:N]`, never a `Co-Authored-By` trailer. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact working tree; tasks with emulator tests also run `node scripts/ci-local.mjs --full` (Java 11 or later) before committing. `git commit` is its own tool call.

## Decisions

1. **Ledger only, amounts from the job.** `amount = jobs.payment`; skipped (logged, no doc, `paymentStatus` untouched) when `paymentType === 'volunteer'`, when the amount is not a positive safe integer, or when it exceeds `MAX_ESCROW_AMOUNT = 100_000_000` (warn). Today's client wrote a `released` 0-đ record for free jobs; the server writes nothing for them.
2. **Only server documents count (refines "exists → no-op").** Until 4b's rules ship, clients can still create `payments/{anyId}` (KNOWN HOLE 2), so a forged doc can sit at `payments/{jobId}_{payee}` before the trigger runs. Server docs carry `source: 'server'`. On accept, an existing server doc is a no-op (idempotent) and an existing non-server doc is **replaced** by the server record (warn), the same way `writeNotification` treats legacy notifications. Release and dispute ignore non-server docs (no release; dispute answers `not-found`). Legacy client payments use random ids (`addDoc`), so nothing legitimate lives at the deterministic id.
3. **Independent side effects via `settleAll`.** `onApplicationUpdated` and `onJobUpdated` run `[notification, escrow]` as thunks through `settleAll(label, context, tasks)`: each runs even if another throws (sync or async); failures are `logger.error`'d and the trigger resolves. Retries are not enabled on these triggers, so a transient escrow failure is lost. The error log (`escrow` task, ids) is the signal for manual review. That is acceptable for a ledger-only escrow.
4. **Release keys on the job status transition to `completed`, payee `assignedTo[0]`.** Until slice 5 the client writes completion, and the rules let only the poster set `in-progress -> completed`, so the worst a poster can do is "release" their own escrow to the worker. The worker cannot trigger a release. The server's own `paymentStatus` writes re-fire `onJobUpdated`, but with an unchanged status both handlers no-op (no loop).
5. **Cancellation does not refund in this slice.** A poster could cancel an in-progress job after the work was done and refund themselves (KNOWN HOLE 6). Held escrow stays `held`; slice 6's `cancelJob` decides refund vs release. An emulator test pins this (Task 4) and the README documents it (Task 6).
6. **`disputePayment` uses `requireVerifiedMember`, no App Check yet.** The web client has no App Check and the escrow moves no money. Task 6 records in the backlog that App Check must be enforced before any real payment provider integration. One dispute per job: a second call sees `disputed` and gets `failed-precondition`. The `payment_disputed` notification (sourceId `jobId`) goes to the other party and never contains the reason text. If that notification write fails after the commit, the failure is logged and the call still returns `{ disputed: true }` (the dispute is recorded).
7. **`NotificationType` parity during the 4a/4b split.** Functions add `payment_disputed`; the web union gets it in 4b (bell icon etc.). The parity test pins the exact delta: `expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType | 'payment_disputed'>()`. It stays green after 4b adds the member (the union is idempotent); 4b should simplify it back to strict equality.
8. **Deploy window.** 4a and 4b ship in one window: functions (4a) first, then hosting + rules (4b). Between the two deploys, the old client still creates its own random-id payment and releases it client-side, so a job can have two ledger records (server + legacy). This is cosmetic (no money); 4b reads the deterministic id first. Never deploy 4b's rules first: releases would stop.
9. **Emulator tests call handlers directly** (as in slice 3). The dispute auth denials go through `disputePayment.run(request)` on the emulator db (Task 5), which covers the real wrapper, `requireVerifiedMember` and the handler together without the Functions emulator.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `unijob-web/functions/src/lib/auth.ts` (modify) | `requireVerifiedMember`, `MSG_NOT_VERIFIED` | 1 |
| `unijob-web/functions/src/lib/payments.ts` (create) | `MAX_ESCROW_AMOUNT`, `paymentIdFor`, `escrowAmount`, `isServerPayment`, payment types | 2 |
| `unijob-web/functions/src/lib/settle.ts` (create) | `settleAll` | 2 |
| `unijob-web/functions/src/lib/messages.ts` (modify) | export `safeTitle`; later `messages.paymentDisputed` | 2, 5 |
| `unijob-web/functions/src/handlers/payments.ts` (create, then extend) | `escrowCandidate`, `planHeldPayment`, `handleEscrowOnAccept`; `handleEscrowOnJobUpdate` | 3, 4 |
| `unijob-web/functions/src/triggers/applications.ts` (modify) | `onApplicationUpdated` runs notification + escrow | 3 |
| `unijob-web/functions/src/triggers/jobs.ts` (modify) | `onJobUpdated` runs notification + escrow | 4 |
| `unijob-web/functions/src/handlers/disputes.ts` (create) | `parseDisputeInput`, `handleDisputePayment`, `DISPUTE_MSG`, `DisputePaymentResult` | 5 |
| `unijob-web/functions/src/callables/disputePayment.ts` (create) | `disputePayment` (onCall) | 5 |
| `unijob-web/functions/src/lib/types.ts` (modify) | `NotificationType` + `'payment_disputed'` | 5 |
| `unijob-web/functions/src/index.ts` (modify) | export `disputePayment` | 6 |
| `unijob-web/functions/README.md` (modify) | escrow section + deploy order | 6 |
| `docs/backlog/security-holes.md` (modify) | App Check note, `requireVerifiedMember` done | 6 |

## Parallelism

- **Tasks 1 and 2** are independent (disjoint files); run them in parallel.
- **Task 3** needs Task 2. **Task 4** needs Task 3 (same `handlers/payments.ts` and its test files), so they run in sequence.
- **Task 5** needs Tasks 1 and 2 and is independent of Tasks 3 and 4 (own files; `messages.ts` only gains a new key). Run it in parallel with 3 → 4.
- **Task 6** last (needs 3, 4, 5 merged).

## Review Focus

1. A forged client doc already at `payments/{jobId}_{payee}` (any status, any amount) before the accept trigger: the server replaces it with its own `held` record. A forged `held` doc that was never replaced can be neither released (Task 4) nor disputed (Task 5). Tests in Tasks 3, 4, 5.
2. The accept or completion event delivered twice, also concurrently: exactly one payment doc, the second accept returns `'exists'`, the second release returns `'skipped'`, `heldAt` is not rewritten. Emulator tests in Tasks 3 and 4.
3. Hostile or legacy amounts (`'150000'` string, `1.5`, `-1`, `NaN`, `0`, `100_000_001`, volunteer with a positive amount, missing `paymentType`): only positive safe integers up to 100 000 000 on non-volunteer jobs create a record; skipped jobs keep their `paymentStatus`. Tests in Tasks 2 and 3.
4. The notification handler throwing inside a shared trigger: the escrow handler still runs and the trigger resolves (and vice versa). Trigger unit tests in Tasks 3 and 4, `settleAll` tests in Task 2.
5. A dispute reason padded with spaces, made of emoji, or containing links/control characters: length 10–500 is counted on the trimmed text in code points; the stored `disputeReason` is sanitised; the notification message never contains it. Tests in Task 5.

---

### Task 1: `requireVerifiedMember`

**Independent of Task 2.**

**Files:**
- Modify: `unijob-web/functions/src/lib/auth.ts`
- Test: `unijob-web/functions/tests/unit/auth.test.ts` (extend)

**Interfaces:**
- Consumes: existing `requireAuth`, `MSG_UNAUTHENTICATED`.
- Produces:
  - `MSG_NOT_VERIFIED = 'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.'`
  - `requireVerifiedMember(request: Pick<CallableRequest<unknown>, 'auth'>): string` (returns the uid)

- [ ] **Step 1: Write the failing tests**

Append to `unijob-web/functions/tests/unit/auth.test.ts` (extend the existing import with `MSG_NOT_VERIFIED, requireVerifiedMember`):

```ts
describe('requireVerifiedMember', () => {
  const token = (over: Record<string, unknown> = {}) => ({
    email: 'alice@hcmut.edu.vn',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...over,
  });
  const req = (uid: string, tok: unknown) => ({ auth: { uid, token: tok as never, rawToken: '' } });

  it('returns the uid of a verified HCMUT account', () => {
    expect(requireVerifiedMember(req('alice', token()))).toBe('alice');
  });

  it.each(['Alice@HCMUT.EDU.VN', '  alice@hcmut.edu.vn  '])('normalises case and spaces: %s', (email) => {
    expect(requireVerifiedMember(req('alice', token({ email })))).toBe('alice');
  });

  it('accepts a token without firebase.sign_in_provider (only anonymous is refused)', () => {
    expect(requireVerifiedMember(req('alice', token({ firebase: undefined })))).toBe('alice');
  });

  it('throws unauthenticated without auth or with an empty uid', () => {
    expect(thrown(() => requireVerifiedMember({ auth: undefined })).code).toBe('unauthenticated');
    expect(thrown(() => requireVerifiedMember(req('', token()))).code).toBe('unauthenticated');
  });

  it.each([
    ['missing token', undefined],
    ['unverified email', token({ email_verified: false })],
    ['email_verified missing', token({ email_verified: undefined })],
    ['email_verified as a string', token({ email_verified: 'true' })],
    ['no email', token({ email: undefined })],
    ['email not a string', token({ email: 42 })],
    ['gmail', token({ email: 'alice@gmail.com' })],
    ['lookalike suffix', token({ email: 'alice@hcmut.edu.vn.evil.com' })],
    ['lookalike prefix', token({ email: 'alice@evilhcmut.edu.vn' })],
    ['subdomain', token({ email: 'alice@mail.hcmut.edu.vn' })],
    ['empty local part', token({ email: '@hcmut.edu.vn' })],
    ['two @', token({ email: 'a@b@hcmut.edu.vn' })],
    ['anonymous provider', token({ firebase: { sign_in_provider: 'anonymous' } })],
  ])('throws permission-denied (Vietnamese) for %s', (_label, tok) => {
    const err = thrown(() => requireVerifiedMember(req('alice', tok)));
    expect(err.code).toBe('permission-denied');
    expect(err.message).toBe(MSG_NOT_VERIFIED);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/auth.test.ts`
Expected: FAIL, `requireVerifiedMember` is not exported.

- [ ] **Step 3: Implement `requireVerifiedMember` in `src/lib/auth.ts`**

Call `requireAuth(request)` first (the unauthenticated branch). Then read `request.auth.token` defensively, because it may be missing. Check `email_verified === true` (strictly boolean) and that `email` is a string. `email.trim().toLowerCase()` split on `'@'` must give exactly two parts, the first non-empty and the second exactly `'hcmut.edu.vn'`. Also check `token.firebase?.sign_in_provider !== 'anonymous'`. Any failure throws `new HttpsError('permission-denied', MSG_NOT_VERIFIED)`. Add a JSDoc line: "Gate for money/reputation callables (backlog: Before the first money/reputation callable)."

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/auth.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/auth.ts unijob-web/functions/tests/unit/auth.test.ts
git commit -m "feat(functions): add requireVerifiedMember for HCMUT-verified callers [task:1]"
```

---

### Task 2: Escrow primitives (`lib/payments.ts`, `settleAll`, `safeTitle`)

**Independent of Task 1.**

**Files:**
- Create: `unijob-web/functions/src/lib/payments.ts`
- Create: `unijob-web/functions/src/lib/settle.ts`
- Modify: `unijob-web/functions/src/lib/messages.ts` (export `safeTitle`, use it in `t`)
- Test: `unijob-web/functions/tests/unit/payments.test.ts`
- Test: `unijob-web/functions/tests/unit/settle.test.ts`
- Test: `unijob-web/functions/tests/unit/messages.test.ts` (extend)

**Interfaces:**
- Consumes: existing `clip`, `safeText`, `calculatePlatformFee`.
- Produces:
  - `MAX_ESCROW_AMOUNT = 100_000_000`
  - `type PaymentStatus = 'held' | 'released' | 'refunded' | 'disputed'`
  - `interface HeldPaymentFields { jobId: string; jobTitle: string; payerId: string; payeeId: string; amount: number; platformFee: number; netAmount: number; status: 'held'; method: 'platform_escrow'; note: ''; source: 'server' }` (the handler adds the timestamps)
  - `paymentIdFor(jobId: string, payeeId: string): string` → `${jobId}_${payeeId}`
  - `type EscrowAmount = { ok: true; amount: number } | { ok: false; reason: 'volunteer' | 'invalid_amount' | 'over_cap' }`
  - `escrowAmount(job: DocumentData): EscrowAmount`
  - `isServerPayment(data: DocumentData | undefined): boolean` (`data?.source === 'server'`)
  - `settleAll(label: string, context: Record<string, unknown>, tasks: ReadonlyArray<readonly [name: string, run: () => Promise<unknown>]>): Promise<void>`
  - `safeTitle(title: string): string` (= `clip(safeText(title), 120)`, the same transform notification messages use)

- [ ] **Step 1: Write the failing tests**

`unijob-web/functions/tests/unit/payments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escrowAmount, isServerPayment, MAX_ESCROW_AMOUNT, paymentIdFor } from '../../src/lib/payments.js';

describe('paymentIdFor', () => {
  it('is `${jobId}_${payeeId}`', () => expect(paymentIdFor('j1', 'w1')).toBe('j1_w1'));
});

describe('escrowAmount', () => {
  it.each([
    [{ payment: 150_000, paymentType: 'fixed' }, 150_000],
    [{ payment: 1, paymentType: 'hourly' }, 1],
    [{ payment: 50_000, paymentType: 'negotiable' }, 50_000],
    [{ payment: 50_000 }, 50_000], // legacy job without paymentType
    [{ payment: MAX_ESCROW_AMOUNT, paymentType: 'fixed' }, 100_000_000],
  ])('accepts %o', (job, amount) => {
    expect(escrowAmount(job)).toEqual({ ok: true, amount });
  });

  it('skips volunteer jobs even with a positive amount', () => {
    expect(escrowAmount({ payment: 50_000, paymentType: 'volunteer' })).toEqual({ ok: false, reason: 'volunteer' });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '150000', null, undefined])('rejects amount %s', (payment) => {
    expect(escrowAmount({ payment, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'invalid_amount' });
  });

  it('rejects amounts above 100 000 000 as over_cap, unsafe integers as invalid_amount', () => {
    expect(escrowAmount({ payment: 100_000_001, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'over_cap' });
    expect(escrowAmount({ payment: Number.MAX_SAFE_INTEGER, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'over_cap' });
    expect(escrowAmount({ payment: Number.MAX_SAFE_INTEGER + 2, paymentType: 'fixed' })).toEqual({ ok: false, reason: 'invalid_amount' });
  });
});

describe('isServerPayment', () => {
  it('is true only for source: "server"', () => {
    expect(isServerPayment({ source: 'server' })).toBe(true);
    expect(isServerPayment({ source: 'client' })).toBe(false);
    expect(isServerPayment({})).toBe(false);
    expect(isServerPayment(undefined)).toBe(false);
  });
});
```

`unijob-web/functions/tests/unit/settle.test.ts`:

```ts
import { logger } from 'firebase-functions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleAll } from '../../src/lib/settle.js';

afterEach(() => vi.restoreAllMocks());

describe('settleAll', () => {
  it('runs every task even when an earlier one rejects or throws synchronously, and resolves', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const ran: string[] = [];
    await expect(
      settleAll('onX', { id: 'a1' }, [
        ['sync', () => { throw new Error('boom'); }],
        ['async', async () => { ran.push('async'); throw new Error('later'); }],
        ['ok', async () => { ran.push('ok'); }],
      ]),
    ).resolves.toBeUndefined();
    expect(ran).toEqual(['async', 'ok']);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('onX: sync failed', expect.objectContaining({ id: 'a1', error: expect.any(Error) }));
    expect(error).toHaveBeenCalledWith('onX: async failed', expect.objectContaining({ id: 'a1' }));
  });

  it('logs nothing when every task succeeds', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await settleAll('onX', {}, [['a', async () => 1], ['b', async () => 2]]);
    expect(error).not.toHaveBeenCalled();
  });
});
```

Append to `unijob-web/functions/tests/unit/messages.test.ts` (extend the import with `safeTitle`):

```ts
describe('safeTitle', () => {
  it('sanitises and clips like notification titles', () => {
    expect(safeTitle('Xem www.evil.com\nngay')).toBe('Xem [liên kết] ngay');
    expect(Array.from(safeTitle('t'.repeat(5000)))).toHaveLength(120);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/payments.test.ts tests/unit/settle.test.ts tests/unit/messages.test.ts`
Expected: FAIL, cannot resolve `src/lib/payments.js` / `src/lib/settle.js`; `safeTitle` not exported.

- [ ] **Step 3: Implement**

- `src/lib/payments.ts`: the Interfaces above. `escrowAmount` checks in this order: `paymentType === 'volunteer'` → `volunteer`; not a number, not `Number.isSafeInteger`, or `<= 0` → `invalid_amount`; `> MAX_ESCROW_AMOUNT` → `over_cap`. One-line doc comment: "Ledger only: no money moves (no payment provider)."
- `src/lib/settle.ts`: wrap each thunk as `Promise.resolve().then(run)` (so a synchronous throw becomes a rejection), run them with `Promise.allSettled`, then for each rejected result call `logger.error(\`${label}: ${name} failed\`, { ...context, error: reason })`. Never rethrows.
- `src/lib/messages.ts`: `export const safeTitle = (title: string) => clip(safeText(title), MAX_TITLE);` and make the private `t` use it.

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck`
Expected: PASS (all unit tests; existing message tests unchanged).

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/payments.ts unijob-web/functions/src/lib/settle.ts unijob-web/functions/src/lib/messages.ts unijob-web/functions/tests/unit/payments.test.ts unijob-web/functions/tests/unit/settle.test.ts unijob-web/functions/tests/unit/messages.test.ts
git commit -m "feat(functions): add escrow amount rules, payment ids and settleAll [task:2]"
```

---

### Task 3: Hold escrow when an application is accepted

**Depends on Task 2.**

**Files:**
- Create: `unijob-web/functions/src/handlers/payments.ts`
- Modify: `unijob-web/functions/src/triggers/applications.ts`
- Test: `unijob-web/functions/tests/unit/handlers/payments.test.ts`
- Test: `unijob-web/functions/tests/unit/triggers/applications.test.ts` (extend)
- Test: `unijob-web/functions/tests/emulator/payments.emulator.test.ts`

**Interfaces:**
- Consumes (Task 2): `paymentIdFor`, `escrowAmount`, `isServerPayment`, `HeldPaymentFields`, `settleAll`, `safeTitle`; existing `isDocId`, `toJobInfo`, `calculatePlatformFee`, `handleApplicationUpdated`.
- Produces:
  - `escrowCandidate(appId: string, before: DocumentData | undefined, after: DocumentData | undefined): { jobId: string; applicantId: string } | null`
  - `type EscrowSkipReason = 'job_missing' | 'job_not_in_progress' | 'not_assigned' | 'bad_poster' | 'volunteer' | 'invalid_amount' | 'over_cap'`
  - `planHeldPayment(jobId: string, applicantId: string, job: DocumentData | undefined): { ok: true; payment: HeldPaymentFields } | { ok: false; reason: EscrowSkipReason }`
  - `type AcceptEscrowResult = 'created' | 'exists' | 'skipped'`
  - `handleEscrowOnAccept(db: Firestore, appId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<AcceptEscrowResult>`

- [ ] **Step 1: Write the failing pure-function tests**

`unijob-web/functions/tests/unit/handlers/payments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escrowCandidate, planHeldPayment } from '../../../src/handlers/payments.js';

const pending = { jobId: 'j1', applicantId: 'w1', status: 'pending' };
const accepted = { ...pending, status: 'accepted' };
const job = { title: 'Nhập liệu', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'], payment: 150_000, paymentType: 'fixed' };

describe('escrowCandidate', () => {
  it('pending -> accepted with a canonical id yields the job and applicant', () => {
    expect(escrowCandidate('j1_w1', pending, accepted)).toEqual({ jobId: 'j1', applicantId: 'w1' });
  });
  it.each([
    ['rejected', 'j1_w1', pending, { ...pending, status: 'rejected' }],
    ['already accepted', 'j1_w1', accepted, accepted],
    ['legacy random id', 'randomId', pending, accepted],
    ['id of another applicant', 'j1_w2', pending, accepted],
    ['jobId with a slash', 'a/b_w1', { ...pending, jobId: 'a/b' }, { ...accepted, jobId: 'a/b' }],
    ['missing applicantId', 'j1_', { ...pending, applicantId: '' }, { ...accepted, applicantId: '' }],
    ['no before', 'j1_w1', undefined, accepted],
    ['no after', 'j1_w1', pending, undefined],
  ])('is null for %s', (_l, appId, before, after) => {
    expect(escrowCandidate(appId, before, after)).toBeNull();
  });
});

describe('planHeldPayment', () => {
  it('builds the held record with fee and net amount from the job', () => {
    expect(planHeldPayment('j1', 'w1', job)).toEqual({
      ok: true,
      payment: {
        jobId: 'j1', jobTitle: 'Nhập liệu', payerId: 'p1', payeeId: 'w1',
        amount: 150_000, platformFee: 4_500, netAmount: 145_500,
        status: 'held', method: 'platform_escrow', note: '', source: 'server',
      },
    });
  });
  it('sanitises the title and falls back to "công việc"', () => {
    const plan = (title: unknown) => planHeldPayment('j1', 'w1', { ...job, title });
    expect(plan('Xem www.evil.com')).toMatchObject({ payment: { jobTitle: 'Xem [liên kết]' } });
    expect(plan('   ')).toMatchObject({ payment: { jobTitle: 'công việc' } });
    expect(plan('t'.repeat(5000))).toMatchObject({ ok: true });
  });
  it.each([
    ['job_missing', undefined],
    ['job_not_in_progress', { ...job, status: 'open' }],
    ['not_assigned', { ...job, assignedTo: ['someoneElse'] }],
    ['bad_poster', { ...job, postedBy: '' }],
    ['bad_poster', { ...job, postedBy: 'w1' }],
    ['volunteer', { ...job, paymentType: 'volunteer' }],
    ['invalid_amount', { ...job, payment: '150000' }],
    ['over_cap', { ...job, payment: 100_000_001 }],
  ])('skips with %s', (reason, data) => {
    expect(planHeldPayment('j1', 'w1', data)).toEqual({ ok: false, reason });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/payments.test.ts`
Expected: FAIL, cannot resolve `src/handlers/payments.js`.

- [ ] **Step 3: Implement `escrowCandidate`, `planHeldPayment`, `handleEscrowOnAccept` in `src/handlers/payments.ts`**

`escrowCandidate` returns a candidate only when `before.status === 'pending'`, `after.status === 'accepted'`, `isDocId(after.jobId)`, `isDocId(after.applicantId)` and `appId === \`${jobId}_${applicantId}\``. `planHeldPayment` checks in the order of the test table: missing job, status, assignment via `toJobInfo(...).assignedTo`, poster, then `escrowAmount`. It sets `jobTitle = safeTitle(info.title)`, `platformFee = calculatePlatformFee(amount)` and `netAmount = amount - platformFee`. The transaction reads before it writes and never throws on a skip:

```ts
export async function handleEscrowOnAccept(db: Firestore, appId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<AcceptEscrowResult> {
  const c = escrowCandidate(appId, before, after);
  if (!c) return 'skipped';
  const jobRef = db.collection('jobs').doc(c.jobId);
  const payRef = db.collection('payments').doc(paymentIdFor(c.jobId, c.applicantId));
  return db.runTransaction(async (tx) => {
    const [jobSnap, paySnap] = await Promise.all([tx.get(jobRef), tx.get(payRef)]);
    if (paySnap.exists && isServerPayment(paySnap.data())) return 'exists';
    const plan = planHeldPayment(c.jobId, c.applicantId, jobSnap.data());
    if (!plan.ok) {
      const log = plan.reason === 'over_cap' ? logger.warn : logger.info;
      log('escrow: no payment on accept', { appId, reason: plan.reason });
      return 'skipped';
    }
    if (paySnap.exists) logger.warn('escrow: replacing a non-server payment doc', { paymentId: payRef.id });
    tx.set(payRef, { ...plan.payment, createdAt: FieldValue.serverTimestamp(), heldAt: FieldValue.serverTimestamp(), releasedAt: null });
    tx.update(jobRef, { paymentStatus: 'held' });
    return 'created';
  });
}
```

- [ ] **Step 4: Run to verify the pure tests pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the trigger wiring test (failing)**

In `unijob-web/functions/tests/unit/triggers/applications.test.ts`, add the mock `vi.mock('../../../src/handlers/payments.js', () => ({ handleEscrowOnAccept: vi.fn(async () => 'created') }));`, import `handleEscrowOnAccept`, and add:

```ts
  it('onApplicationUpdated also runs the escrow handler with the same arguments', async () => {
    const event = { params: { appId: 'j1_carol' }, data: { before: snap({ status: 'pending' }), after: snap({ status: 'accepted' }) } };
    await onApplicationUpdated.run(event as never);
    expect(handleEscrowOnAccept).toHaveBeenCalledWith({ fake: 'db' }, 'j1_carol', { status: 'pending' }, { status: 'accepted' });
  });

  it('a failing notification does not skip the escrow (and vice versa); the trigger resolves', async () => {
    const event = { params: { appId: 'j1_carol' }, data: { before: snap({ status: 'pending' }), after: snap({ status: 'accepted' }) } };
    vi.mocked(handleApplicationUpdated).mockRejectedValueOnce(new Error('notify down'));
    await expect(onApplicationUpdated.run(event as never)).resolves.toBeUndefined();
    expect(handleEscrowOnAccept).toHaveBeenCalledTimes(1);
    vi.mocked(handleEscrowOnAccept).mockRejectedValueOnce(new Error('escrow down'));
    await expect(onApplicationUpdated.run(event as never)).resolves.toBeUndefined();
    expect(handleApplicationUpdated).toHaveBeenCalledTimes(2);
  });
```

The existing `handleApplicationUpdated` assertions stay unchanged.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/applications.test.ts`
Expected: FAIL, `handleEscrowOnAccept` not called.

- [ ] **Step 6: Wire `onApplicationUpdated` through `settleAll`**

In `src/triggers/applications.ts`, `onApplicationUpdated` reads `appId`, `before` and `after` once and calls `settleAll('onApplicationUpdated', { appId }, [['notification', () => handleApplicationUpdated(db, appId, before, after)], ['escrow', () => handleEscrowOnAccept(db, appId, before, after)]])`. `onApplicationCreated` is unchanged.

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Write the emulator test**

`unijob-web/functions/tests/emulator/payments.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleEscrowOnAccept } from '../../src/handlers/payments.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

/** A job in the state the accept batch leaves it in, plus the application before/after data. */
async function acceptedJob(job: Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  const appId = `${jobId}_${worker}`;
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', postedBy: poster, status: 'in-progress', payment: 150_000, paymentType: 'fixed',
    applicants: [worker], assignedTo: [worker], ...job,
  });
  const before = { jobId, applicantId: worker, status: 'pending' };
  return { poster, worker, jobId, appId, before, after: { ...before, status: 'accepted' } };
}

const paymentOf = (jobId: string, worker: string) => db.doc(`payments/${jobId}_${worker}`).get();

describe('escrow on accept (emulator)', () => {
  it('creates one held server payment and sets jobs.paymentStatus, idempotent under concurrent redelivery', async () => {
    const { poster, worker, jobId, appId, before, after } = await acceptedJob();
    const results = await Promise.all([
      handleEscrowOnAccept(db, appId, before, after),
      handleEscrowOnAccept(db, appId, before, after),
    ]);
    expect(results.sort()).toEqual(['created', 'exists']);
    const pay = await paymentOf(jobId, worker);
    expect(pay.data()).toMatchObject({
      jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500,
      netAmount: 145_500, status: 'held', method: 'platform_escrow', note: '', source: 'server', releasedAt: null,
    });
    expect(pay.get('heldAt')).toBeInstanceOf(Timestamp);
    expect(pay.get('createdAt')).toBeInstanceOf(Timestamp);
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBe('held');
    const heldAt = pay.get('heldAt') as Timestamp;
    await expect(handleEscrowOnAccept(db, appId, before, after)).resolves.toBe('exists');
    expect(((await paymentOf(jobId, worker)).get('heldAt') as Timestamp).isEqual(heldAt)).toBe(true);
  });

  it.each([
    ['volunteer', { paymentType: 'volunteer', payment: 50_000 }],
    ['zero amount', { payment: 0 }],
    ['oversized amount', { payment: 100_000_001 }],
    ['string amount', { payment: '150000' }],
  ])('%s: no payment, paymentStatus untouched', async (_l, job) => {
    const { worker, jobId, appId, before, after } = await acceptedJob(job);
    await expect(handleEscrowOnAccept(db, appId, before, after)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).exists).toBe(false);
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBeUndefined();
  });

  it('skips when the applicant is not assigned or the job is not in progress', async () => {
    const a = await acceptedJob({ assignedTo: [] });
    await expect(handleEscrowOnAccept(db, a.appId, a.before, a.after)).resolves.toBe('skipped');
    const b = await acceptedJob({ status: 'open' });
    await expect(handleEscrowOnAccept(db, b.appId, b.before, b.after)).resolves.toBe('skipped');
    expect((await paymentOf(a.jobId, a.worker)).exists).toBe(false);
    expect((await paymentOf(b.jobId, b.worker)).exists).toBe(false);
  });

  it('replaces a forged client doc at the deterministic id with the server record', async () => {
    const { poster, worker, jobId, appId, before, after } = await acceptedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payerId: worker, payeeId: worker, amount: 1, status: 'released' });
    await expect(handleEscrowOnAccept(db, appId, before, after)).resolves.toBe('created');
    expect((await paymentOf(jobId, worker)).data()).toMatchObject({ payerId: poster, amount: 150_000, status: 'held', source: 'server' });
  });
});
```

- [ ] **Step 8: Run the emulator test**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/payments.emulator.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 9: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS; coverage shows `functions/src/handlers/payments.ts` at 70% or more.

- [ ] **Step 10: Commit**

```bash
git add unijob-web/functions/src/handlers/payments.ts unijob-web/functions/src/triggers/applications.ts unijob-web/functions/tests/unit/handlers/payments.test.ts unijob-web/functions/tests/unit/triggers/applications.test.ts unijob-web/functions/tests/emulator/payments.emulator.test.ts
git commit -m "feat(functions): hold escrow server-side when an application is accepted [task:3]"
```

---

### Task 4: Release escrow when the job is completed

**Depends on Task 3 (same files).**

**Files:**
- Modify: `unijob-web/functions/src/handlers/payments.ts`
- Modify: `unijob-web/functions/src/triggers/jobs.ts`
- Test: `unijob-web/functions/tests/unit/handlers/payments.test.ts` (extend)
- Test: `unijob-web/functions/tests/unit/triggers/jobs.test.ts` (extend)
- Test: `unijob-web/functions/tests/emulator/payments.emulator.test.ts` (extend)

**Interfaces:**
- Consumes (Tasks 2, 3): `paymentIdFor`, `isServerPayment`, `settleAll`, `handleEscrowOnAccept` (emulator setup); existing `toJobInfo`, `isDocId`, `handleJobUpdated`.
- Produces:
  - `type ReleaseEscrowResult = 'released' | 'skipped'`
  - `handleEscrowOnJobUpdate(db: Firestore, jobId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<ReleaseEscrowResult>`

- [ ] **Step 1: Write the failing unit test (no-read paths)**

Append to `unijob-web/functions/tests/unit/handlers/payments.test.ts` (extend the import with `handleEscrowOnJobUpdate`; add `import type { Firestore } from 'firebase-admin/firestore';`):

```ts
describe('handleEscrowOnJobUpdate without a completion transition', () => {
  const db = {} as Firestore; // must not touch the db
  const job = { postedBy: 'p1', assignedTo: ['w1'], status: 'in-progress' };
  it.each([
    ['status unchanged', job, { ...job, paymentStatus: 'held' }],
    ['already completed', { ...job, status: 'completed' }, { ...job, status: 'completed', paymentStatus: 'released' }],
    ['cancelled (no auto-refund, KNOWN HOLE 6)', job, { ...job, status: 'cancelled' }],
    ['no worker', { ...job, assignedTo: [] }, { ...job, assignedTo: [], status: 'completed' }],
    ['worker id with a slash', { ...job, assignedTo: ['a/b'] }, { ...job, assignedTo: ['a/b'], status: 'completed' }],
    ['no before', undefined, { ...job, status: 'completed' }],
  ])('%s -> skipped', async (_l, before, after) => {
    await expect(handleEscrowOnJobUpdate(db, 'j1', before, after)).resolves.toBe('skipped');
  });
});
```

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/payments.test.ts`
Expected: FAIL, `handleEscrowOnJobUpdate` is not exported.

- [ ] **Step 2: Implement `handleEscrowOnJobUpdate`**

Guard without db access: `before && after && before.status !== 'completed' && after.status === 'completed'`, the payee is `toJobInfo(jobId, after).assignedTo[0]`, and `isDocId(payee)` holds; otherwise return `'skipped'`. Then run one transaction on `payments/${paymentIdFor(jobId, payee)}`. If the doc is missing, fails `isServerPayment`, or has `status !== 'held'` (disputed, refunded, released), return `'skipped'` and log info with the status. Otherwise `tx.update(payRef, { status: 'released', releasedAt: FieldValue.serverTimestamp() })` and `tx.update(jobRef, { paymentStatus: 'released' })`, then return `'released'`. Doc comment: cancellation never refunds here (Decision 5).

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/payments.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend the trigger wiring test (failing)**

In `unijob-web/functions/tests/unit/triggers/jobs.test.ts`, add `vi.mock('../../../src/handlers/payments.js', () => ({ handleEscrowOnJobUpdate: vi.fn(async () => 'skipped') }));`, import it, add `beforeEach(() => vi.clearAllMocks())` (import `beforeEach` from vitest), and add:

```ts
  it('also runs the escrow handler, and a failing notification does not skip it', async () => {
    const event = { params: { jobId: 'j1' }, data: { before: snap({ status: 'in-progress' }), after: snap({ status: 'completed' }) } };
    vi.mocked(handleJobUpdated).mockRejectedValueOnce(new Error('notify down'));
    await expect(onJobUpdated.run(event as never)).resolves.toBeUndefined();
    expect(handleEscrowOnJobUpdate).toHaveBeenCalledWith({ fake: 'db' }, 'j1', { status: 'in-progress' }, { status: 'completed' });
    vi.mocked(handleEscrowOnJobUpdate).mockRejectedValueOnce(new Error('escrow down'));
    await expect(onJobUpdated.run(event as never)).resolves.toBeUndefined();
    expect(handleJobUpdated).toHaveBeenCalledTimes(2);
  });
```

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/jobs.test.ts`
Expected: FAIL.

- [ ] **Step 4: Wire `onJobUpdated` through `settleAll`**

`settleAll('onJobUpdated', { jobId }, [['notification', () => handleJobUpdated(db, jobId, before, after)], ['escrow', () => handleEscrowOnJobUpdate(db, jobId, before, after)]])`.

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Extend the emulator test**

Append to `unijob-web/functions/tests/emulator/payments.emulator.test.ts` (extend the import with `handleEscrowOnJobUpdate`):

```ts
describe('escrow release on completion (emulator)', () => {
  async function held() {
    const s = await acceptedJob();
    await handleEscrowOnAccept(db, s.appId, s.before, s.after);
    const jobBefore = (await db.doc(`jobs/${s.jobId}`).get()).data();
    return { ...s, jobBefore };
  }
  const moveTo = async (jobId: string, status: string) => {
    await db.doc(`jobs/${jobId}`).update({ status });
    return (await db.doc(`jobs/${jobId}`).get()).data();
  };

  it('in-progress -> completed releases the held payment once, also when delivered twice', async () => {
    const { worker, jobId, jobBefore } = await held();
    const jobAfter = await moveTo(jobId, 'completed');
    const results = await Promise.all([
      handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter),
      handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter),
    ]);
    expect(results.sort()).toEqual(['released', 'skipped']);
    const pay = await paymentOf(jobId, worker);
    expect(pay.get('status')).toBe('released');
    expect(pay.get('releasedAt')).toBeInstanceOf(Timestamp);
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBe('released');
  });

  it('a disputed payment is not released', async () => {
    const { worker, jobId, jobBefore } = await held();
    await db.doc(`payments/${jobId}_${worker}`).update({ status: 'disputed' });
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('disputed');
  });

  it('cancelling an in-progress job leaves the escrow held (no auto-refund, KNOWN HOLE 6 / slice 6)', async () => {
    const { worker, jobId, jobBefore } = await held();
    const jobAfter = await moveTo(jobId, 'cancelled');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBe('held');
  });

  it('a forged non-server held doc is never released', async () => {
    const { worker, jobId } = await acceptedJob();
    await db.doc(`payments/${jobId}_${worker}`).set({ jobId, payeeId: worker, amount: 999, status: 'held' });
    const jobBefore = (await db.doc(`jobs/${jobId}`).get()).data();
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
    expect((await paymentOf(jobId, worker)).get('status')).toBe('held');
  });

  it('no payment (volunteer job) -> skipped without error', async () => {
    const { jobId } = await acceptedJob({ paymentType: 'volunteer' });
    const jobBefore = (await db.doc(`jobs/${jobId}`).get()).data();
    const jobAfter = await moveTo(jobId, 'completed');
    await expect(handleEscrowOnJobUpdate(db, jobId, jobBefore, jobAfter)).resolves.toBe('skipped');
  });
});
```

- [ ] **Step 6: Run the emulator test**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/payments.emulator.test.ts"`
Expected: PASS (12 tests).

- [ ] **Step 7: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS.

- [ ] **Step 8: Commit**

```bash
git add unijob-web/functions/src/handlers/payments.ts unijob-web/functions/src/triggers/jobs.ts unijob-web/functions/tests/unit/handlers/payments.test.ts unijob-web/functions/tests/unit/triggers/jobs.test.ts unijob-web/functions/tests/emulator/payments.emulator.test.ts
git commit -m "feat(functions): release held escrow when a job is completed [task:4]"
```

---

### Task 5: `disputePayment` callable and `payment_disputed` notification

**Depends on Tasks 1 and 2. Independent of Tasks 3 and 4.**

**Files:**
- Create: `unijob-web/functions/src/handlers/disputes.ts`
- Create: `unijob-web/functions/src/callables/disputePayment.ts`
- Modify: `unijob-web/functions/src/lib/types.ts` (`NotificationType`)
- Modify: `unijob-web/functions/src/lib/messages.ts` (`messages.paymentDisputed`)
- Test: `unijob-web/functions/tests/unit/handlers/disputes.test.ts`
- Test: `unijob-web/functions/tests/unit/callables/disputePayment.test.ts`
- Test: `unijob-web/functions/tests/unit/messages.test.ts` (extend)
- Test: `unijob-web/functions/tests/unit/parity.test.ts` (Decision 7)
- Test: `unijob-web/functions/tests/emulator/disputes.emulator.test.ts`

**Interfaces:**
- Consumes: `requireVerifiedMember` (Task 1); `paymentIdFor`, `isServerPayment`, `safeTitle` (Task 2); existing `assertMember`, `MSG_JOB_NOT_FOUND`, `isDocId`, `toJobInfo`, `clip`, `safeText`, `writeNotification`.
- Produces:
  - `NotificationType` gains `'payment_disputed'`
  - `messages.paymentDisputed(title: string): string` = `` `⚠️ Thanh toán ký quỹ cho "${t(title)}" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.` ``
  - `DISPUTE_MSG = { invalid: 'Yêu cầu không hợp lệ.', reasonLength: 'Lý do tranh chấp phải dài từ 10 đến 500 ký tự.', noPayment: 'Chưa có thanh toán ký quỹ cho công việc này.', notHeld: 'Chỉ có thể báo tranh chấp khi tiền đang được giữ ký quỹ.' } as const`
  - `REASON_MIN = 10`, `REASON_MAX = 500`
  - `parseDisputeInput(data: unknown): { jobId: string; reason: string }` (reason trimmed; validates `jobId` first; throws `HttpsError('invalid-argument', …)`)
  - `interface DisputePaymentResult { disputed: true }`
  - `handleDisputePayment(db: Firestore, uid: string, data: unknown): Promise<DisputePaymentResult>`
  - `disputePayment` (v2 `onCall`, region `REGION`). 4b calls it with `{ jobId, reason }`

- [ ] **Step 1: Write the failing unit tests**

`unijob-web/functions/tests/unit/handlers/disputes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DISPUTE_MSG, parseDisputeInput } from '../../../src/handlers/disputes.js';

const reason = 'Người làm chưa giao bài';

describe('parseDisputeInput', () => {
  it('returns the job id and the trimmed reason', () => {
    expect(parseDisputeInput({ jobId: 'j1', reason: `  ${reason}  ` })).toEqual({ jobId: 'j1', reason });
  });
  it('counts code points: 10 emoji pass, 500 pass, 501 fail', () => {
    expect(parseDisputeInput({ jobId: 'j1', reason: '😡'.repeat(10) }).reason).toBe('😡'.repeat(10));
    expect(parseDisputeInput({ jobId: 'j1', reason: 'a'.repeat(500) }).reason).toHaveLength(500);
    expect(() => parseDisputeInput({ jobId: 'j1', reason: 'a'.repeat(501) })).toThrow(DISPUTE_MSG.reasonLength);
  });
  it.each([
    ['too short after trimming', { jobId: 'j1', reason: '   short   ' }, DISPUTE_MSG.reasonLength],
    ['reason not a string', { jobId: 'j1', reason: 42 }, DISPUTE_MSG.reasonLength],
    ['missing reason', { jobId: 'j1' }, DISPUTE_MSG.reasonLength],
    ['jobId with a slash', { jobId: 'a/b', reason }, DISPUTE_MSG.invalid],
    ['missing jobId', { reason }, DISPUTE_MSG.invalid],
    ['not an object', 'j1', DISPUTE_MSG.invalid],
    ['null', null, DISPUTE_MSG.invalid],
  ])('rejects %s with invalid-argument', (_l, data, message) => {
    expect(() => parseDisputeInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message }));
  });
});
```

`unijob-web/functions/tests/unit/callables/disputePayment.test.ts`:

```ts
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/disputes.js', () => ({ handleDisputePayment: vi.fn(async () => ({ disputed: true })) }));

import { disputePayment } from '../../../src/callables/disputePayment.js';
import { handleDisputePayment } from '../../../src/handlers/disputes.js';

const verified = { email: 'alice@hcmut.edu.vn', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const request = (uid?: string, token: unknown = verified) =>
  ({ data: { jobId: 'j1', reason: 'xxxxxxxxxx' }, auth: uid ? { uid, token, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => disputePayment.run(req));

beforeEach(() => vi.clearAllMocks());

describe('disputePayment', () => {
  it('is a callable in asia-southeast1', () => {
    expect(disputePayment.__endpoint.region).toEqual(['asia-southeast1']);
    expect(disputePayment.__endpoint.callableTrigger).toBeDefined();
  });
  it('passes the Admin db, the verified uid and the data', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ disputed: true });
    expect(handleDisputePayment).toHaveBeenCalledWith({ fake: 'db' }, 'alice', { jobId: 'j1', reason: 'xxxxxxxxxx' });
  });
  it.each([
    ['signed out', request(), 'unauthenticated'],
    ['unverified email', request('alice', { ...verified, email_verified: false }), 'permission-denied'],
    ['non-HCMUT email', request('alice', { ...verified, email: 'alice@gmail.com' }), 'permission-denied'],
    ['anonymous user', request('alice', { firebase: { sign_in_provider: 'anonymous' } }), 'permission-denied'],
  ])('rejects %s before touching data', async (_l, req, code) => {
    await expect(call(req)).rejects.toMatchObject({ code });
    expect(handleDisputePayment).not.toHaveBeenCalled();
  });
});
```

Append to `unijob-web/functions/tests/unit/messages.test.ts`:

```ts
it('paymentDisputed', () => {
  expect(messages.paymentDisputed('Nhập liệu')).toBe(
    '⚠️ Thanh toán ký quỹ cho "Nhập liệu" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.',
  );
});
```

In `unijob-web/functions/tests/unit/parity.test.ts`, replace the `NotificationType` assertion with:

```ts
  // Slice 4a adds payment_disputed server-side; 4b adds it to the web union (then simplify back to strict equality).
  it('NotificationType equals the web union plus payment_disputed', () => {
    expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType | 'payment_disputed'>();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/disputes.test.ts tests/unit/callables/disputePayment.test.ts tests/unit/messages.test.ts && npm run typecheck`
Expected: FAIL (missing modules, missing `paymentDisputed`; typecheck fails on the parity assertion).

- [ ] **Step 3: Implement**

- `src/lib/types.ts`: add `| 'payment_disputed'` and change its comment to point at Decision 7 of this plan.
- `src/lib/messages.ts`: add `paymentDisputed` (exact text in Interfaces).
- `src/handlers/disputes.ts`: implement `parseDisputeInput` to match the tests (length is `Array.from(trimmed).length`). `handleDisputePayment`:

```ts
export async function handleDisputePayment(db: Firestore, uid: string, data: unknown): Promise<DisputePaymentResult> {
  const { jobId, reason } = parseDisputeInput(data);
  const jobRef = db.collection('jobs').doc(jobId);
  const { otherParty, title } = await db.runTransaction(async (tx) => {
    const job = toJobInfo(jobId, (await tx.get(jobRef)).data());
    if (!job) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
    const role = assertMember(job, uid);
    const payee = job.assignedTo[0];
    if (!isDocId(payee)) throw new HttpsError('not-found', DISPUTE_MSG.noPayment);
    const payRef = db.collection('payments').doc(paymentIdFor(jobId, payee));
    const pay = (await tx.get(payRef)).data();
    if (!pay || !isServerPayment(pay)) throw new HttpsError('not-found', DISPUTE_MSG.noPayment);
    if (pay.status !== 'held') throw new HttpsError('failed-precondition', DISPUTE_MSG.notHeld);
    tx.update(payRef, {
      status: 'disputed', disputedBy: uid, disputedAt: FieldValue.serverTimestamp(),
      disputeReason: clip(safeText(reason), REASON_MAX),
    });
    tx.update(jobRef, { paymentStatus: 'disputed' });
    return { otherParty: role === 'poster' ? String(pay.payeeId) : String(pay.payerId), title: job.title };
  });
  try {
    await writeNotification(db, {
      userId: otherParty, type: 'payment_disputed', message: messages.paymentDisputed(title),
      extras: { jobId, jobTitle: safeTitle(title) }, sourceId: jobId,
    });
  } catch (error) {
    logger.error('disputePayment: notification failed after commit', { jobId, error });
  }
  return { disputed: true };
}
```

- `src/callables/disputePayment.ts`: `onCall({ region: REGION }, (request): Promise<DisputePaymentResult> => handleDisputePayment(db, requireVerifiedMember(request), request.data))`; re-export the `DisputePaymentResult` type (like `sendJobInvite.ts`).

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Write the emulator test**

`unijob-web/functions/tests/emulator/disputes.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeAll, describe, expect, it } from 'vitest';
import { DISPUTE_MSG, handleDisputePayment } from '../../src/handlers/disputes.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
let disputePayment: typeof import('../../src/callables/disputePayment.js').disputePayment;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
  // after the guards: the callable binds to the same emulator-backed Admin db
  ({ disputePayment } = await import('../../src/callables/disputePayment.js'));
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const reason = 'Người làm chưa giao bài đúng hạn';

/** In-progress job with a server-held payment (shape written by handleEscrowOnAccept). */
async function heldJob(payment: Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker], payment: 150_000, paymentType: 'fixed', paymentStatus: 'held' });
  await db.doc(`payments/${jobId}_${worker}`).set({
    jobId, jobTitle: 'Nhập liệu', payerId: poster, payeeId: worker, amount: 150_000, platformFee: 4_500, netAmount: 145_500,
    status: 'held', method: 'platform_escrow', note: '', source: 'server', createdAt: Timestamp.now(), heldAt: Timestamp.now(), releasedAt: null,
    ...payment,
  });
  return { poster, worker, jobId, payRef: db.doc(`payments/${jobId}_${worker}`) };
}

const verifiedRequest = (id: string, data: unknown, token: Record<string, unknown> = {}) =>
  ({
    data,
    auth: { uid: id, rawToken: '', token: { email: `${id}@hcmut.edu.vn`, email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...token } },
    rawRequest: {},
    acceptsStreaming: false,
  }) as unknown as CallableRequest<unknown>;

describe('disputePayment on the emulator', () => {
  it('the poster disputes: payment and job become disputed, the worker gets one payment_disputed without the reason', async () => {
    const { poster, worker, jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(poster, { jobId, reason: `  ${reason} www.evil.com ` }))).resolves.toEqual({ disputed: true });
    const pay = (await payRef.get()).data();
    expect(pay).toMatchObject({ status: 'disputed', disputedBy: poster, disputeReason: `${reason} [liên kết]` });
    expect(pay?.disputedAt).toBeInstanceOf(Timestamp);
    expect((await db.doc(`jobs/${jobId}`).get()).get('paymentStatus')).toBe('disputed');
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`payment_disputed_${jobId}`]);
    expect(docs[0].data()).toMatchObject({
      type: 'payment_disputed', source: 'server', jobId,
      message: '⚠️ Thanh toán ký quỹ cho "Nhập liệu" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.',
    });
    expect(docs[0].get('message')).not.toContain(reason);
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });

  it('the worker disputes: the poster is notified; a second dispute is failed-precondition', async () => {
    const { poster, worker, jobId } = await heldJob();
    await expect(handleDisputePayment(db, worker, { jobId, reason })).resolves.toEqual({ disputed: true });
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`payment_disputed_${jobId}`]);
    await expect(handleDisputePayment(db, poster, { jobId, reason })).rejects.toMatchObject({ code: 'failed-precondition', message: DISPUTE_MSG.notHeld });
  });

  it('an outsider gets permission-denied and nothing changes', async () => {
    const { jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(uid('mallory'), { jobId, reason }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it.each([
    ['unverified email', { email_verified: false }],
    ['non-HCMUT email', { email: 'poster@gmail.com' }],
    ['anonymous user', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s: the poster is refused with permission-denied and nothing changes', async (_l, token) => {
    const { poster, jobId, payRef } = await heldJob();
    await expect(disputePayment.run(verifiedRequest(poster, { jobId, reason }, token))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await payRef.get()).get('status')).toBe('held');
  });

  it.each(['released', 'refunded'])('a %s payment cannot be disputed', async (status) => {
    const { poster, jobId } = await heldJob({ status });
    await expect(handleDisputePayment(db, poster, { jobId, reason })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('a forged non-server payment or no payment at all is not-found', async () => {
    const forged = await heldJob({ source: 'client' });
    await expect(handleDisputePayment(db, forged.poster, { jobId: forged.jobId, reason })).rejects.toMatchObject({ code: 'not-found', message: DISPUTE_MSG.noPayment });
    const none = await heldJob();
    await none.payRef.delete();
    await expect(handleDisputePayment(db, none.poster, { jobId: none.jobId, reason })).rejects.toMatchObject({ code: 'not-found', message: DISPUTE_MSG.noPayment });
  });

  it('a bad reason is invalid-argument and a missing job is not-found', async () => {
    const { poster, jobId, payRef } = await heldJob();
    await expect(handleDisputePayment(db, poster, { jobId, reason: 'ngắn' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await payRef.get()).get('status')).toBe('held');
    await expect(handleDisputePayment(db, poster, { jobId: uid('nojob'), reason })).rejects.toMatchObject({ code: 'not-found' });
  });
});
```

- [ ] **Step 5: Run the emulator test**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/disputes.emulator.test.ts"`
Expected: PASS (10 tests).

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS; `handlers/disputes.ts` and `callables/disputePayment.ts` at 70% or more.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/functions/src/handlers/disputes.ts unijob-web/functions/src/callables/disputePayment.ts unijob-web/functions/src/lib/types.ts unijob-web/functions/src/lib/messages.ts unijob-web/functions/tests/unit/handlers/disputes.test.ts unijob-web/functions/tests/unit/callables/disputePayment.test.ts unijob-web/functions/tests/unit/messages.test.ts unijob-web/functions/tests/unit/parity.test.ts unijob-web/functions/tests/emulator/disputes.emulator.test.ts
git commit -m "feat(functions): add disputePayment callable with payment_disputed notification [task:5]"
```

---

### Task 6: Export `disputePayment`, document escrow and the deploy order

**Depends on Tasks 3, 4 and 5.**

**Files:**
- Modify: `unijob-web/functions/src/index.ts`
- Modify: `unijob-web/functions/README.md`
- Modify: `docs/backlog/security-holes.md`
- Test: `unijob-web/functions/tests/unit/index.test.ts`

**Interfaces:**
- Consumes: `disputePayment` (Task 5); the triggers changed in Tasks 3 and 4 keep their export names.
- Produces: the deployable set `disputePayment, expireJobs, onApplicationCreated, onApplicationUpdated, onJobCompletionWritten, onJobUpdated, ping, sendJobInvite`.

- [ ] **Step 1: Write the failing test**

In `unijob-web/functions/tests/unit/index.test.ts`, add `'disputePayment'` to the expected key list.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/index.test.ts`
Expected: FAIL, `disputePayment` missing.

- [ ] **Step 2: Implement and document**

- `src/index.ts`: `export { disputePayment } from './callables/disputePayment.js';`
- `README.md`:
  - Add `requireVerifiedMember`, `settleAll` and `src/lib/payments.ts` to the `src/lib/` bullet.
  - Add a section `## Escrow (slice 4)` with a table of three rows:
    - `onApplicationUpdated`: pending -> accepted writes `payments/{jobId}_{payeeId}` as `held` and sets `jobs.paymentStatus: 'held'`; skips volunteer jobs, non-positive amounts and amounts above 100 000 000.
    - `onJobUpdated`: -> completed moves `held` to `released`.
    - `disputePayment`: callable `{ jobId, reason }` -> `{ disputed: true }`, gated by `requireVerifiedMember`; sends `payment_disputed` to the other party.
  - Below the table, add: "Ledger only, no money moves. Cancellation leaves escrow `held` until slice 6's `cancelJob` (KNOWN HOLE 6). Only docs with `source: 'server'` are released or disputable; a non-server doc at the deterministic id is replaced on accept. The notification and escrow handlers of a trigger run independently (`settleAll`): a failure is logged with `logger.error` and not retried."
  - In "Deploying functions", add: "Slice 4 order, one window: `--only functions` (4a), then `--only hosting,firestore:rules` from the 4b branch. Between them a job may get two ledger records (old client random-id + server); never deploy the 4b rules first, or releases stop."
- `docs/backlog/security-holes.md`, section "Before the first money/reputation callable":
  - Replace the `requireVerifiedMember` bullet with: "`requireVerifiedMember` (`functions/src/lib/auth.ts`, slice 4a): verified `@hcmut.edu.vn` email, not anonymous. Used by `disputePayment`; use it for every money/reputation callable."
  - Replace the App Check bullet with: "App Check is **not** enforced on `disputePayment` (decided in slice 4a: the web client has no App Check and the escrow is a ledger record only). It must be enabled (client + `enforceAppCheck: true`) before any real payment provider integration."
  - Do not touch the pinned KNOWN HOLE list (4b flips those).

- [ ] **Step 3: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck && npm run build`
Expected: PASS, `lib/` emitted.

- [ ] **Step 4: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (every emulator test, coverage gate over the branch).

- [ ] **Step 5: Commit**

```bash
git add unijob-web/functions/src/index.ts unijob-web/functions/README.md unijob-web/functions/tests/unit/index.test.ts docs/backlog/security-holes.md
git commit -m "docs(functions): export disputePayment and document server escrow [task:6]"
```

---

## Self-review notes

- Spec slice 4 (server half): the accept trigger creates `payments/{jobId}_{payeeId}` with the fee from `fees.ts` and sets `paymentStatus` (Task 3); release on completion (Task 4); callable `disputePayment` (Task 5); `requireVerifiedMember` from the backlog (Task 1). The rules (clients cannot create or update payments, KNOWN HOLE flips) and all client changes are 4b.
- Names are consistent across tasks: `paymentIdFor`, `escrowAmount`, `isServerPayment`, `settleAll`, `safeTitle`, `escrowCandidate`, `planHeldPayment`, `handleEscrowOnAccept`, `handleEscrowOnJobUpdate`, `parseDisputeInput`, `handleDisputePayment`, `DISPUTE_MSG`, `DisputePaymentResult`.
- The PR body must state: deploy needs Blaze; functions (4a) first, then hosting + rules (4b) in one window; a possible duplicate ledger record in between; no auto-refund on cancel (slice 6); App Check not enforced yet.
