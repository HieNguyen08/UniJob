---
status: approved
approved: 2026-10-17 by HieNguyen08 in chat ("giờ làm bước tiếp theo", "tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-notifications-client
base: feat/server-notification-triggers
slice: 3b (spec section 3, slice 3 "server notifications", client + rules half)
stacked-on: docs/plans/2026-10-17-server-notification-triggers.md
---

# Client stops sending notifications (slice 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web client no longer writes any notification, the expired-job cleanup no longer runs in the browser, poster invites go through the `sendJobInvite` callable, and the Firestore rules deny `notifications.create` to every client, which flips KNOWN HOLE "users cannot create notifications for other users".

**Architecture:** Plan 3a (stacked below this branch) made Cloud Functions write every notification. This plan removes the client side: `createNotification` calls in `job.service.ts`, `cancel.service.ts`, `rating.service.ts`, the whole `cleanup.service.ts` and its call in `App.tsx`, and the direct notification in `CreateJob.tsx`, which now calls a new `invite.service.ts` (lazy `firebase/functions`). Rules: `allow create: if false` on `notifications`, since the inventory in 3a found no flow where a client legitimately notifies only itself.

**Tech Stack:** React 19 + TypeScript, Firebase JS SDK (`firebase/firestore`, `firebase/functions`), Vitest (`unit`, `rules` projects), `@firebase/rules-unit-testing` on the Firestore emulator (`demo-unijob`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 3; testing rules in section 5).

## Global Constraints

- Callable region `asia-southeast1`, callable name `sendJobInvite`, request `{ jobId: string; workerId: string }`, response `{ sent: boolean }` (produced by 3a Task 6).
- Callable errors arrive as `FirebaseError` with `code` `functions/<code>` and the server's Vietnamese message. Show the server message only for user-facing codes (`invalid-argument`, `not-found`, `permission-denied`, `failed-precondition`, `unauthenticated`); otherwise the existing fallback `Không thể gửi lời mời, thử lại`.
- UI copy is Vietnamese.
- New unit tests go in `unijob-web/tests/unit/` mirroring `src/`; rules tests in `unijob-web/tests/rules/`. Never weaken a test: a test that asserted a client create succeeds becomes an `assertFails` (stricter), never deleted without a replacement.
- New `src/services/**` files need at least 70% line coverage (`invite.service.ts`). Changed legacy services (listed in `ci/coverage-legacy.json`) keep or gain tests.
- Keep `firebase/functions` out of the entry chunk (dynamic `import()`), or the `bundle-budget` gate fails.
- Conventional Commits, message ends `[task:N]`, no `Co-Authored-By`. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact tree; tasks touching rules also run `node scripts/ci-local.mjs --full` (needs Java 11 or later).
- Do not change `unijob-web/functions/src/**` behaviour in this PR (only the doc comment noted in Task 1).

## Deploy order (goes in the PR body)

0. Data first (see [docs/backlog/security-holes.md](../backlog/security-holes.md)):
   - Confirm `unijob-web/scripts/migrate-applications.mjs` has been run (`--apply`, after a clean dry-run). Without it, random-id applications cannot be assigned and jobs without `applicants` cannot be applied to.
   - Legacy `jobCompletions` docs with random ids: the rules now only accept `jobCompletions/{jobId}`. Either migrate the in-progress ones to `jobCompletions/{jobId}` (keep `workerConfirmed`/`posterConfirmed`), or accept that those jobs restart the two-step confirmation (the worker reports completion again).
1. 3a: `npx firebase deploy --only firestore:indexes`, wait for the index, then `--only functions`.
2. Right after: this PR, `npx firebase deploy --only hosting,firestore:rules` (run `npm run build` first).
Never deploy these rules before 3a's functions: no one would receive notifications. Between steps 1 and 2 old clients may produce duplicate notifications (accepted, see 3a Decision 1). After step 2, already-open old tabs get `permission-denied` on their notification writes; every call site already swallows those errors (non-critical try/catch) until the tab reloads. Old tabs also fail `createJob` until reloaded: their bundle sends `deadline: Timestamp.now()` (not in the future) when the date is left empty (and a picked date as 07:00 Vietnam time, so picking today fails after 07:00), which the new jobs rules deny ("Lỗi khi đăng việc").

## Decisions

1. **`notifications.create` is `if false`, not `userId == auth.uid`.** The 3a inventory found one self-notification (`deadline_expired` from `cleanup.service.ts`), and it moves to the scheduler. Allowing self-creates would let any user forge server-looking entries (any `type`, any `message`) in their own feed for no feature.
2. **`workerCancelJob` loses its poster notification without a server replacement in this slice.** The flow is already denied by the rules before it reaches the notification (backlog "Worker cancel"); slice 6's `cancelJob` callable writes it.
3. **`runDecisionSideEffects` shrinks to the escrow step only** (`createEscrowForAccepted`). Rejections now have no client side effects (no reads), accepts still create the payment client-side until slice 4.
4. **Invites go through `invite.service.ts`, not directly from the page** (services own backend access, pages stay thin).

## File Structure

| File | Change | Task |
|---|---|---|
| `unijob-web/firestore.rules` | notifications `create: if false` | 1 |
| `unijob-web/tests/rules/firestore.rules.test.ts` | flip KNOWN HOLE, convert client-create tests to denials | 1 |
| `docs/backlog/security-holes.md` | remove the fixed hole and the client-notifications entry | 1 |
| `unijob-web/functions/src/lib/notifications.ts` | doc comment only (squatting is now legacy-only) | 1 |
| `unijob-web/src/services/job.service.ts` | drop notifications; `createEscrowForAccepted` | 2 |
| `unijob-web/tests/unit/services/job.service.test.ts` | follow the change | 2 |
| `unijob-web/src/services/cancel.service.ts` | drop notifications and the reads that only fed them | 3 |
| `unijob-web/src/services/rating.service.ts` | drop notifications in `confirmCompletion` | 3 |
| `unijob-web/tests/unit/services/cancel.service.test.ts` (create) | tests | 3 |
| `unijob-web/tests/unit/services/rating.service.test.ts` (create) | tests | 3 |
| `unijob-web/src/services/cleanup.service.ts` | delete | 4 |
| `unijob-web/src/App.tsx` | remove the cleanup effect | 4 |
| `ci/coverage-legacy.json` | remove the deleted file's entry | 4 |
| `unijob-web/src/services/invite.service.ts` (create) | `sendJobInvite`, `inviteErrorMessage` | 5 |
| `unijob-web/src/types/notification.ts`, `unijob-web/src/types/index.ts` | `SendJobInviteResult` | 5 |
| `unijob-web/src/pages/CreateJob.tsx` | use `invite.service` | 5 |
| `unijob-web/tests/unit/services/invite.service.test.ts` (create) | tests | 5 |
| `unijob-web/src/services/notification.service.ts` | delete `createNotification` | 6 |
| `unijob-web/tests/unit/services/notification.service.test.ts` (create) | export + source guard test | 6 |

## Parallelism

- **Tasks 1, 2, 3, 4, 5** touch disjoint files and can run as parallel workers in separate worktrees cut from this branch.
- **Task 6** runs last: it deletes `createNotification`, which only compiles once Tasks 2, 3 and 5 removed every caller, and its guard test checks Task 4's deletion.

## Review Focus

1. A user still on an old tab after the deploy: their `createNotification` writes are denied, and the action they took (apply, accept, cancel, confirm) must still succeed. Pinned in Task 2 and Task 3 tests by asserting the service makes no notification write at all and that the main write path is unchanged.
2. An invite to the same worker twice: the second click shows `Bạn đã mời {name} rồi.` instead of a false success, and the worker is still marked as invited (Task 5).
3. A callable failing with `functions/internal` or a network error: the toast shows the generic fallback, never `internal` (Task 5 `inviteErrorMessage` tests).
4. A client that pre-created (squatted) `notifications/{type}_{id}` before this deploy: it can no longer create new ones, and still cannot add `source` to the legacy doc (Task 1).
5. A future change re-adding a client notification write: caught by the source guard test (Task 6).

---

### Task 1: Rules deny client notification creates (flip KNOWN HOLE)

**Independent of Tasks 2 to 5.**

**Files:**
- Modify: `unijob-web/firestore.rules:175-185` (notifications block)
- Modify: `unijob-web/tests/rules/firestore.rules.test.ts:561-599` (notifications describe)
- Modify: `docs/backlog/security-holes.md`
- Modify: `unijob-web/functions/src/lib/notifications.ts:43-50` (doc comment only)

**Interfaces:**
- Consumes: nothing.
- Produces: rule `notifications.create` denied for every client.

- [ ] **Step 1: Change the tests first**

In `unijob-web/tests/rules/firestore.rules.test.ts`, inside `describe('notifications', ...)`:

Replace the KNOWN HOLE test (line 566-568) with:

```ts
  it('users cannot create notifications for other users', async () => {
    const payload = { userId: 'alice', type: 'new_application', message: 'spam', read: false };
    await assertFails(setDoc(doc(as('mallory'), 'notifications/spam'), payload));
    // sanity: the same document written server-side (Admin SDK bypasses rules) is valid and readable by its owner
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'notifications/spam'), { ...payload, source: 'server' }));
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications/spam')));
  });
```

Replace `it('clients can still create a notification without source (current client flows)', ...)` (lines 569-571) with:

```ts
  it('clients cannot create notifications, not even for themselves (the server sends every notification)', async () => {
    await assertFails(setDoc(doc(as('bob'), 'notifications/client-made'), { userId: 'alice', message: 'hi', read: false }));
    await assertFails(setDoc(doc(as('alice'), 'notifications/self-made'), { userId: 'alice', message: 'hi', read: false }));
  });
```

Replace `it('clients can create a notification with exactly the keys the web client sends', ...)` (lines 576-589) with:

```ts
  it('the payload the old web client sent is denied', async () => {
    await assertFails(
      setDoc(doc(as('bob'), 'notifications/client-shaped'), {
        userId: 'alice',
        type: 'new_application',
        message: 'Có ứng viên mới',
        read: false,
        jobId: 'job1',
        jobTitle: 'Nhập liệu',
        fromName: 'Bob',
        createdAt: serverTimestamp(),
      }),
    );
  });
```

Replace the squat test (lines 593-599) with:

```ts
  it('a client cannot squat a server id {type}_{id}, and cannot add source to a legacy squatted doc', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/new_application_app8'), { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: false }));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'notifications/new_application_app9'), { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: false }),
    );
    const squat = doc(as('mallory'), 'notifications/new_application_app9');
    await assertSucceeds(getDoc(squat)); // sanity: the legacy doc is mallory's
    await assertFails(updateDoc(squat, { source: 'server' }));
    await assertFails(updateDoc(squat, { read: true, source: 'server' }));
    await assertFails(setDoc(squat, { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: true, source: 'server' }));
  });
```

Keep `clients can never set source on create`, `clients cannot set source even to null`, and every update/read test unchanged.

- [ ] **Step 2: Run the rules tests to verify the new expectations fail**

Run: `cd unijob-web && npm run test:rules`
Expected: FAIL in exactly the four changed tests (creates still succeed).

- [ ] **Step 3: Change the rule**

In `unijob-web/firestore.rules`, replace the notifications block comment and create rule (lines 175-180) with:

```
    // NOTIFICATIONS: chỉ chủ sở hữu đọc/đánh dấu đã đọc. Mọi thông báo do server (Cloud Functions,
    // Admin SDK) tạo với `source: 'server'`; client không bao giờ được tạo.
    match /notifications/{notifId} {
      allow read: if isAuth() && resource.data.userId == request.auth.uid;
      allow create: if false;
```

Leave `allow update` and `allow delete` unchanged.

- [ ] **Step 4: Run the rules tests to verify they pass**

Run: `cd unijob-web && npm run test:rules`
Expected: PASS; the remaining `it.fails('KNOWN HOLE ...')` tests still pass as expected failures.

- [ ] **Step 5: Update the docs**

`docs/backlog/security-holes.md`:
- In "Pinned by `it.fails`", delete item 4 (`Users cannot create notifications for other users`) and renumber the following items 4 to 7.
- In "Not yet pinned by tests", delete the bullet **Client-side notifications to other users**; append to the **Worker cancel** bullet: ` Its poster notification (job_cancelled) was removed from the client in slice 3 and is written by slice 6's cancelJob.`; add a bullet: `- **sendJobInvite rate limit** — one invite per worker per job, but no cap on invites per poster across jobs.`
- Replace the "Notification ids" bullet under "Before the first money/reputation callable" with: `- Notification ids: server notifications are written to notifications/{type}_{sourceId} with source: 'server'. Clients cannot create notifications since slice 3; writeNotification still replaces a legacy client document at the same id that lacks source: 'server'.`

`unijob-web/functions/src/lib/notifications.ts`, replace the second paragraph of the `writeNotification` doc comment (lines 46-49) with:

```ts
 * Before slice 3 clients could create notifications/{anyId}, so a legacy document may exist at this
 * id without `source: 'server'`: it is replaced, not treated as a duplicate. Clients can no longer
 * create notifications, and the rules forbid them from setting `source`.
```

- [ ] **Step 6: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests in full).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/firestore.rules unijob-web/tests/rules/firestore.rules.test.ts docs/backlog/security-holes.md unijob-web/functions/src/lib/notifications.ts
git commit -m "fix(rules): deny client-created notifications [task:1]"
```

---

### Task 2: job.service stops sending notifications

**Independent of Tasks 1, 3, 4, 5.**

**Files:**
- Modify: `unijob-web/src/services/job.service.ts` (import line 24, `applyForJob` lines 193-209, `runDecisionSideEffects` lines 232-276, `updateApplicationStatus` line 289, `acceptApplication` lines 329-333)
- Test: `unijob-web/tests/unit/services/job.service.test.ts`

**Interfaces:**
- Consumes: `createPayment` from `@/services/payment.service` (unchanged).
- Produces: unchanged public API (`applyForJob`, `updateApplicationStatus`, `acceptApplication`); `job.service.ts` no longer imports `@/services/notification.service`.

- [ ] **Step 1: Update the tests first**

In `unijob-web/tests/unit/services/job.service.test.ts`:
- Delete line 29 (`vi.mock('@/services/notification.service', ...)`) and line 33 (`import { createNotification } ...`).
- Add after the remaining imports: `import { addDoc } from 'firebase/firestore';` (merge into the existing `firebase/firestore` import) and `import { createPayment } from '@/services/payment.service';`.
- In `applyForJob` › `batches the application set ...` replace `expect(createNotification).toHaveBeenCalledTimes(1);` with:

```ts
    expect(addDoc).not.toHaveBeenCalled(); // no client notification (server trigger sends new_application)
    expect(getDoc).toHaveBeenCalledTimes(1); // only the already-applied check, no job read for a notification
```

- In `surfaces a commit failure and sends no notification`, delete the `createNotification` line (the test name becomes `surfaces a commit failure`).
- In `acceptApplication` › `commits one batch ...` replace `expect(createNotification).toHaveBeenCalledTimes(1);` with:

```ts
    expect(createPayment).toHaveBeenCalledWith('j1', 'T', 'p', 'u1', 5, 'platform_escrow');
    expect(addDoc).not.toHaveBeenCalled();
```

- In `surfaces a commit failure and runs no side effects`, replace the `createNotification` line with `expect(createPayment).not.toHaveBeenCalled();`.
- Replace the test `runs side effects for the accepted and every rejected application only after commit` with:

```ts
    it('creates the escrow for the accepted application only, after commit; rejections have no side effects', async () => {
      const order: string[] = [];
      batchOps.commit.mockImplementation(async () => {
        order.push('commit');
      });
      vi.mocked(createPayment).mockImplementation((async (jobId: string, _t: string, _payer: string, payee: string) => {
        order.push(`payment:${jobId}:${payee}`);
      }) as never);
      await acceptApplication('j1', 'j1_u1', 'u1', ['j1_u2', 'j1_u3']);
      expect(order).toEqual(['commit', 'payment:j1:u1']);
      const reads = vi.mocked(getDoc).mock.calls.map((c) => (c[0] as { _path: string })._path);
      expect(reads).not.toContain('applications/j1_u2');
      expect(reads).not.toContain('applications/j1_u3');
      expect(addDoc).not.toHaveBeenCalled();
    });
```

- In `runs no side effects when the commit fails`, replace the `createNotification` line with `expect(createPayment).not.toHaveBeenCalled();`.
- Replace `describe('updateApplicationStatus', ...)` with:

```ts
describe('updateApplicationStatus', () => {
  it('rejecting only updates the application (no reads, no notification, no payment)', async () => {
    await updateApplicationStatus('j1_u1', 'rejected');
    expect(callFor(vi.mocked(updateDoc), 'applications/j1_u1')?.[1]).toEqual({ status: 'rejected', updatedAt: 'SERVER_TS' });
    expect(getDoc).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('accepting creates the escrow payment', async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1'
        ? snap(true, { jobId: 'j1', applicantId: 'u1' })
        : snap(true, { title: 'T', postedBy: 'p', paymentType: 'fixed', payment: 5 })) as never);
    await updateApplicationStatus('j1_u1', 'accepted');
    expect(createPayment).toHaveBeenCalledWith('j1', 'T', 'p', 'u1', 5, 'platform_escrow');
  });

  it('volunteer jobs and missing jobs get no payment; a payment failure is swallowed', async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1' ? snap(true, { jobId: 'j1', applicantId: 'u1' }) : snap(true, { paymentType: 'volunteer' })) as never);
    await updateApplicationStatus('j1_u1', 'accepted');
    expect(createPayment).not.toHaveBeenCalled();

    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1' ? snap(true, { jobId: 'j1', applicantId: 'u1' }) : snap(false)) as never);
    await updateApplicationStatus('j1_u1', 'accepted');
    expect(createPayment).not.toHaveBeenCalled();

    vi.mocked(getDoc).mockImplementation((async (ref: { _path: string }) =>
      ref._path === 'applications/j1_u1'
        ? snap(true, { jobId: 'j1', applicantId: 'u1' })
        : snap(true, { title: 'T', postedBy: 'p', paymentType: 'fixed', payment: 5 })) as never);
    vi.mocked(createPayment).mockRejectedValueOnce(new Error('denied'));
    await expect(updateApplicationStatus('j1_u1', 'accepted')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/job.service.test.ts`
Expected: FAIL (the service still reads the job and writes notifications; `addDoc` is called through the real `notification.service` or rejections still read applications).

- [ ] **Step 3: Implement**

In `unijob-web/src/services/job.service.ts`:
- Delete line 24 `import { createNotification } from '@/services/notification.service';`.
- In `applyForJob`, delete the whole `// Notify the job poster` try/catch block (lines 193-209); the function returns `applicationId` right after `await batch.commit();`.
- Replace `runDecisionSideEffects` (lines 232-276) with:

```ts
/**
 * After an accept was committed: create the escrow payment record (slice 4 moves this server-side).
 * Notifications are sent by Cloud Functions. Never throws (non-critical).
 */
async function createEscrowForAccepted(applicationId: string): Promise<void> {
  try {
    const appSnap = await getDoc(doc(db, 'applications', applicationId));
    if (!appSnap.exists()) return;
    const app = appSnap.data() as Application;
    const jobSnap = await getDoc(doc(db, 'jobs', app.jobId));
    const jobData = jobSnap.exists() ? (jobSnap.data() as Job) : null;
    if (!jobData || jobData.paymentType === 'volunteer') return;
    const createPaymentFn = await getCreatePayment();
    await createPaymentFn(
      app.jobId,
      jobData.title ?? 'công việc',
      jobData.postedBy, // payer = poster
      app.applicantId, // payee = worker
      jobData.payment ?? 0,
      'platform_escrow'
    );
  } catch (payErr) {
    console.warn('[payment] Không tạo được bản ghi thanh toán:', payErr);
  }
}
```

- In `updateApplicationStatus`, replace `await runDecisionSideEffects(applicationId, status);` with `if (status === 'accepted') await createEscrowForAccepted(applicationId);`.
- In `acceptApplication`, replace the three lines after `await batch.commit();` (side effects for accepted and the `Promise.allSettled` loop over `others`) with `await createEscrowForAccepted(applicationId);`. Update the doc comment: "Notifications for the accepted and rejected applicants are sent by Cloud Functions."

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/job.service.test.ts && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/job.service.ts unijob-web/tests/unit/services/job.service.test.ts
git commit -m "refactor(jobs): stop sending application notifications from the client [task:2]"
```

---

### Task 3: cancel.service and rating.service stop sending notifications

**Independent of Tasks 1, 2, 4, 5.**

**Files:**
- Modify: `unijob-web/src/services/cancel.service.ts`
- Modify: `unijob-web/src/services/rating.service.ts` (import line 17, `confirmCompletion` lines 115-128 and 145-159)
- Test (create): `unijob-web/tests/unit/services/cancel.service.test.ts`
- Test (create): `unijob-web/tests/unit/services/rating.service.test.ts`

**Interfaces:**
- Consumes: `getUserById`, `updateUserProfile` (user.service), `getJobById`, `updateJob`, `updateApplicationStatus` (job.service), `recordWorkHistory`, `getPaymentByJob`, `releasePayment` (unchanged).
- Produces: unchanged signatures of `workerCancelJob`, `posterCancelJob`, `confirmCompletion`. Neither file imports `@/services/notification.service` any more.

- [ ] **Step 1: Write the failing tests**

`unijob-web/tests/unit/services/cancel.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/user.service', () => ({ getUserById: vi.fn(), updateUserProfile: vi.fn() }));
vi.mock('@/services/job.service', () => ({ getJobById: vi.fn(), updateJob: vi.fn(), updateApplicationStatus: vi.fn() }));
vi.mock('@/services/notification.service', () => {
  throw new Error('cancel.service must not import notification.service');
});

import { posterCancelJob, workerCancelJob } from '@/services/cancel.service';
import { getJobById, updateApplicationStatus, updateJob } from '@/services/job.service';
import { getUserById, updateUserProfile } from '@/services/user.service';

const inHours = (h: number) => ({ toDate: () => new Date(Date.now() + h * 3_600_000) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserById).mockResolvedValue({ ratingScore: 4.5, activeJobCount: 2 } as never);
});

describe('posterCancelJob', () => {
  it('cancels without penalty when no worker is assigned, and reads no job for a notification', async () => {
    await expect(posterCancelJob('j1', 'poster', false)).resolves.toEqual({ penaltyPoints: 0, message: 'Đã hủy việc thành công.' });
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'cancelled' });
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(getJobById).not.toHaveBeenCalled();
  });
  it('applies the 5-point penalty when a worker is assigned', async () => {
    const res = await posterCancelJob('j1', 'poster', true);
    expect(res.penaltyPoints).toBe(5);
    expect(updateUserProfile).toHaveBeenCalledWith('poster', { ratingScore: 4 });
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'cancelled' });
  });
});

describe('workerCancelJob', () => {
  it.each([
    [6, 20],
    [18, 10],
    [72, 5],
  ])('%dh before the deadline costs %d points', async (hours, points) => {
    const res = await workerCancelJob('j1', 'j1_w', 'w', 'Khác', inHours(hours));
    expect(res.penaltyPoints).toBe(points);
  });
  it('without a deadline costs 5, rejects the application, reopens the job, sends nothing', async () => {
    const res = await workerCancelJob('j1', 'j1_w', 'w', 'Khác', null);
    expect(res).toEqual({ penaltyPoints: 5, message: 'Đã hủy — bạn bị trừ 5 điểm uy tín.' });
    expect(updateUserProfile).toHaveBeenCalledWith('w', { ratingScore: 4, activeJobCount: 1 });
    expect(updateApplicationStatus).toHaveBeenCalledWith('j1_w', 'rejected');
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'open' });
    expect(getJobById).not.toHaveBeenCalled();
  });
});
```

`unijob-web/tests/unit/services/rating.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ _path: `${col}/${id}` })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/workHistory.service', () => ({ recordWorkHistory: vi.fn() }));
vi.mock('@/services/job.service', () => ({ getJobById: vi.fn(), updateJob: vi.fn() }));
vi.mock('@/services/payment.service', () => ({ getPaymentByJob: vi.fn(), releasePayment: vi.fn() }));
vi.mock('@/services/notification.service', () => {
  throw new Error('rating.service must not import notification.service');
});

import { addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { confirmCompletion } from '@/services/rating.service';
import { getJobById, updateJob } from '@/services/job.service';
import { getPaymentByJob, releasePayment } from '@/services/payment.service';
import { recordWorkHistory } from '@/services/workHistory.service';

const completion = (over: Record<string, unknown> = {}) => ({
  exists: () => true,
  data: () => ({ jobId: 'j1', workerConfirmed: false, posterConfirmed: false, status: 'pending', ...over }),
});

beforeEach(() => vi.clearAllMocks());

describe('confirmCompletion', () => {
  it('worker first: records the confirmation only (the server notifies the poster)', async () => {
    vi.mocked(getDoc).mockResolvedValue(completion() as never);
    await confirmCompletion('c1', 'worker');
    expect(updateDoc).toHaveBeenCalledWith({ _path: 'jobCompletions/c1' }, { workerConfirmed: true });
    expect(getJobById).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('poster last: confirms, records history, completes the job, releases a held payment, writes no notification', async () => {
    vi.mocked(getDoc).mockResolvedValue(completion({ workerConfirmed: true }) as never);
    vi.mocked(getJobById).mockResolvedValue({ id: 'j1', title: 'T', category: 'it', postedBy: 'p', assignedTo: ['w'] } as never);
    vi.mocked(getPaymentByJob).mockResolvedValue({ id: 'pay1', status: 'held' } as never);
    await confirmCompletion('c1', 'poster');
    expect(updateDoc).toHaveBeenCalledWith({ _path: 'jobCompletions/c1' }, { posterConfirmed: true, status: 'confirmed', completedAt: 'SERVER_TS' });
    expect(recordWorkHistory).toHaveBeenCalledWith('p', 'w', 'j1', 'T', 'it');
    expect(updateJob).toHaveBeenCalledWith('j1', { status: 'completed' });
    expect(releasePayment).toHaveBeenCalledWith('pay1');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('does nothing for a missing completion', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await confirmCompletion('nope', 'worker');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/cancel.service.test.ts tests/unit/services/rating.service.test.ts`
Expected: FAIL with "must not import notification.service".

- [ ] **Step 3: Implement**

`unijob-web/src/services/cancel.service.ts`:
- Delete line 4 (`import { createNotification } ...`) and `getJobById` from the job.service import (line 3 becomes `import { updateJob, updateApplicationStatus } from '@/services/job.service';`).
- In `workerCancelJob`, delete `const job = await getJobById(jobId);` and the `// Notify poster that worker cancelled` try/catch (lines 55 and 58-68). Add above `return`: `// Thông báo cho người đăng: slice 6 (callable cancelJob) sẽ gửi từ server.`
- In `posterCancelJob`, delete `const cancelledJob = await getJobById(jobId);` and the `// Notify assigned worker if any` try/catch (lines 100 and 103-115). Add above `return`: `// Người nhận việc được thông báo bởi Cloud Function onJobUpdated.`

`unijob-web/src/services/rating.service.ts`:
- Delete line 17 (`import { createNotification } ...`).
- In `confirmCompletion`, delete the `// Notify poster when worker submits completion` block (lines 115-128) and the `// Notify both parties` try/catch (lines 145-159). Add a comment at the top of the function body: `// Thông báo (completion_requested, job_completed) do Cloud Functions gửi.`

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/cancel.service.test.ts tests/unit/services/rating.service.test.ts && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/cancel.service.ts unijob-web/src/services/rating.service.ts unijob-web/tests/unit/services/cancel.service.test.ts unijob-web/tests/unit/services/rating.service.test.ts
git commit -m "refactor(services): stop sending cancel and completion notifications from the client [task:3]"
```

---

### Task 4: Remove the client-side expired-job cleanup

**Independent of Tasks 1, 2, 3, 5.** (Its regression guard is part of Task 6's source guard test.)

**Files:**
- Delete: `unijob-web/src/services/cleanup.service.ts`
- Modify: `unijob-web/src/App.tsx:1, 53, 60-71`
- Modify: `ci/coverage-legacy.json` (remove `"unijob-web/src/services/cleanup.service.ts",`)

**Interfaces:**
- Consumes: nothing. Produces: nothing (the scheduled `expireJobs` from 3a Task 5 replaces it).

- [ ] **Step 1: Confirm the only caller**

Run the Grep tool for `cleanup.service|cleanupExpiredJobs` in `unijob-web/src` and `unijob-web/tests`.
Expected: only `src/App.tsx` and `src/services/cleanup.service.ts`.

- [ ] **Step 2: Remove**

- Delete `unijob-web/src/services/cleanup.service.ts` (`git rm`).
- In `unijob-web/src/App.tsx`: line 1 becomes `import { useEffect, type ReactElement } from 'react';`; delete line 53 (`const cleanupRan = useRef(false);`) and the whole effect at lines 60-71 (`// Run expired-job cleanup once per session ...` through its closing `}, [isAuthenticated]);`). `isAuthenticated` stays (used by the routes below).
- In `ci/coverage-legacy.json` remove the `"unijob-web/src/services/cleanup.service.ts",` line.

- [ ] **Step 3: Verify**

Run: `cd unijob-web && npx tsc -b && npx eslint src/App.tsx && node -e "JSON.parse(require('fs').readFileSync('../ci/coverage-legacy.json','utf8'))"`
Expected: clean (no unused `isAuthenticated`/`useRef` warnings, JSON parses).

- [ ] **Step 4: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 5: Commit**

```bash
git add -A unijob-web/src/services/cleanup.service.ts unijob-web/src/App.tsx ci/coverage-legacy.json
git commit -m "refactor(app): drop client-side expired-job cleanup in favour of the scheduler [task:4]"
```

---

### Task 5: Invites through the `sendJobInvite` callable

**Independent of Tasks 1 to 4.**

**Files:**
- Create: `unijob-web/src/services/invite.service.ts`
- Modify: `unijob-web/src/types/notification.ts` (append `SendJobInviteResult`)
- Modify: `unijob-web/src/types/index.ts:4`
- Modify: `unijob-web/src/pages/CreateJob.tsx:7, 145-159`
- Test (create): `unijob-web/tests/unit/services/invite.service.test.ts`

**Interfaces:**
- Consumes: callable `sendJobInvite` (`asia-southeast1`, `{ jobId, workerId }` to `{ sent }`) from 3a Task 6; default export `app` of `@/lib/firebase`.
- Produces:
  - `interface SendJobInviteResult { sent: boolean }` in `@/types`
  - `sendJobInvite(jobId: string, workerId: string): Promise<SendJobInviteResult>`
  - `inviteErrorMessage(err: unknown): string`
  - `INVITE_FALLBACK_ERROR = 'Không thể gửi lời mời, thử lại'`

- [ ] **Step 1: Write the failing test**

`unijob-web/tests/unit/services/invite.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'FUNCTIONS'),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/lib/firebase', () => ({ default: 'APP' }));

import { getFunctions, httpsCallable } from 'firebase/functions';
import { INVITE_FALLBACK_ERROR, inviteErrorMessage, sendJobInvite } from '@/services/invite.service';

beforeEach(() => vi.clearAllMocks());

describe('sendJobInvite', () => {
  it('calls the sendJobInvite callable in asia-southeast1 and returns its data', async () => {
    callable.mockResolvedValue({ data: { sent: true } });
    await expect(sendJobInvite('j1', 'bob')).resolves.toEqual({ sent: true });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'sendJobInvite');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', workerId: 'bob' });
  });
  it('passes sent: false through for a repeat invite', async () => {
    callable.mockResolvedValue({ data: { sent: false } });
    await expect(sendJobInvite('j1', 'bob')).resolves.toEqual({ sent: false });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('Chỉ người đăng việc mới gửi được lời mời.'), { code: 'functions/permission-denied' }));
    await expect(sendJobInvite('j1', 'bob')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('inviteErrorMessage', () => {
  it.each(['invalid-argument', 'not-found', 'permission-denied', 'failed-precondition', 'unauthenticated'])(
    'shows the server message for functions/%s',
    (code) => {
      expect(inviteErrorMessage({ code: `functions/${code}`, message: 'Thông điệp từ server' })).toBe('Thông điệp từ server');
    },
  );
  it.each([
    { code: 'functions/internal', message: 'internal' },
    { code: 'functions/unavailable', message: 'unavailable' },
    { code: 'functions/not-found', message: '' },
    new Error('network'),
    undefined,
    'boom',
  ])('falls back for %j', (err) => {
    expect(inviteErrorMessage(err)).toBe(INVITE_FALLBACK_ERROR);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/invite.service.test.ts`
Expected: FAIL, cannot resolve `@/services/invite.service`.

- [ ] **Step 3: Implement**

Append to `unijob-web/src/types/notification.ts`:

```ts
/** Response of the sendJobInvite callable (unijob-web/functions/src/handlers/invites.ts). */
export interface SendJobInviteResult {
  sent: boolean;
}
```

`unijob-web/src/types/index.ts` line 4 becomes:

```ts
export type { Notification, NotificationType, SendJobInviteResult } from './notification';
```

`unijob-web/src/services/invite.service.ts`:

```ts
import app from '@/lib/firebase';
import type { SendJobInviteResult } from '@/types';

const FUNCTIONS_REGION = 'asia-southeast1';
export const INVITE_FALLBACK_ERROR = 'Không thể gửi lời mời, thử lại';
const USER_FACING = new Set(['invalid-argument', 'not-found', 'permission-denied', 'failed-precondition', 'unauthenticated']);

/** The poster invites a worker to an open job. The server writes the job_invite notification. */
export async function sendJobInvite(jobId: string, workerId: string): Promise<SendJobInviteResult> {
  // lazy: keeps firebase/functions out of the entry chunk
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ jobId: string; workerId: string }, SendJobInviteResult>(
    getFunctions(app, FUNCTIONS_REGION),
    'sendJobInvite'
  );
  const { data } = await call({ jobId, workerId });
  return data;
}

/** The server's Vietnamese message for user-facing callable errors, the generic text otherwise. */
export function inviteErrorMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return INVITE_FALLBACK_ERROR;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !code.startsWith('functions/')) return INVITE_FALLBACK_ERROR;
  if (!USER_FACING.has(code.slice('functions/'.length))) return INVITE_FALLBACK_ERROR;
  return typeof message === 'string' && message ? message : INVITE_FALLBACK_ERROR;
}
```

`unijob-web/src/pages/CreateJob.tsx`:
- Line 7 becomes `import { inviteErrorMessage, sendJobInvite } from '@/services/invite.service';`
- Replace `handleSendInvite` (lines 145-159) with:

```tsx
  const handleSendInvite = async (worker: SmartMatchWorker) => {
    if (!smartMatchModal) return;
    try {
      const { sent } = await sendJobInvite(smartMatchModal.jobId, worker.uid);
      setInvitedIds((prev) => new Set(prev).add(worker.uid));
      if (sent) toast.success(`Đã gửi lời mời đến ${worker.displayName}!`);
      else toast(`Bạn đã mời ${worker.displayName} rồi.`);
    } catch (err) {
      toast.error(inviteErrorMessage(err));
    }
  };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/invite.service.test.ts && npx tsc -b && npx eslint src/pages/CreateJob.tsx src/services/invite.service.ts`
Expected: PASS, clean.

- [ ] **Step 5: Local CI (full: checks the bundle budget with the new lazy chunk)**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS, including `bundle-budget` (entry chunk unchanged within budget) and coverage (`invite.service.ts` at 70% or more).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/invite.service.ts unijob-web/src/types/notification.ts unijob-web/src/types/index.ts unijob-web/src/pages/CreateJob.tsx unijob-web/tests/unit/services/invite.service.test.ts
git commit -m "feat(jobs): send smart-match invites through the sendJobInvite callable [task:5]"
```

---

### Task 6: Delete `createNotification` and guard against client notification writes

**Depends on Tasks 2, 3, 4, 5.**

**Files:**
- Modify: `unijob-web/src/services/notification.service.ts` (delete `createNotification`, lines 20-34, and the now-unused `addDoc`, `serverTimestamp`, `NotificationType` imports)
- Test (create): `unijob-web/tests/unit/services/notification.service.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5 removed every caller; Task 4 deleted `cleanup.service.ts`.
- Produces: `notification.service.ts` exports exactly `subscribeToNotifications`, `markNotificationRead`, `markAllNotificationsRead`.

- [ ] **Step 1: Write the failing test**

`unijob-web/tests/unit/services/notification.service.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import * as service from '@/services/notification.service';

const SRC = join(process.cwd(), 'src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('notification.service', () => {
  it('can only read notifications and mark them read (the server creates them)', () => {
    expect(Object.keys(service).sort()).toEqual(['markAllNotificationsRead', 'markNotificationRead', 'subscribeToNotifications']);
  });
});

describe('no client code writes notifications', () => {
  const files = sourceFiles(SRC);

  it('scans the web sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('%s never calls createNotification or the cleanup service', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\bcreateNotification\b/);
    expect(text).not.toMatch(/cleanup\.service|cleanupExpiredJobs/);
  });

  it('notification.service.ts has no addDoc or setDoc', () => {
    const text = readFileSync(join(SRC, 'services', 'notification.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc)\b/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/notification.service.test.ts`
Expected: FAIL: exports include `createNotification`, and `notification.service.ts` matches `createNotification` and `addDoc`. (If a Task 2 to 5 change is missing, the per-file test names the file.)

- [ ] **Step 3: Implement**

In `unijob-web/src/services/notification.service.ts`: delete the `createNotification` function (lines 20-34); remove `addDoc` and `serverTimestamp` from the `firebase/firestore` import; change line 16 to `import type { Notification } from '@/types/notification';`. Add above `notificationsCollection`: `// Thông báo do Cloud Functions tạo (rules cấm client tạo). Client chỉ đọc và đánh dấu đã đọc.`

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b`
Expected: PASS (whole unit project), typecheck clean.

- [ ] **Step 5: Local CI (full: whole branch before push)**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests, functions-tests with emulator, coverage, build, bundle-budget).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/notification.service.ts unijob-web/tests/unit/services/notification.service.test.ts
git commit -m "refactor(notifications): remove client createNotification and guard against client writes [task:6]"
```

---

## Self-review notes

- Spec slice 3 client half: client stops creating notifications for others (Tasks 2, 3, 5, 6), cleanup.service replaced (Task 4), rule "a client may only create a notification for itself (or none)": none chosen (Decision 1), KNOWN HOLE flipped with a sanity `assertSucceeds` in the same setup (Task 1), backlog updated (Task 1), unit tests for changed services (Tasks 2, 3, 5, 6).
- Names match 3a: callable `sendJobInvite`, region `asia-southeast1`, `{ jobId, workerId }` to `{ sent }`, `SendJobInviteResult`.
- PR body: deploy order (functions first, then hosting + rules), duplicate-notification window, old-tab behaviour, base branch `feat/server-notification-triggers`.
