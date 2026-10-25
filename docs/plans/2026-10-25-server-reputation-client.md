---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-reputation-client
base: feat/server-reputation
slice: 6b (spec section 3, slice 6 "server reputation", client + rules half)
stacked-on: docs/plans/2026-10-25-server-reputation.md
---

# Client stops writing reputation and cancels through the server (slice 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web client never writes reputation or job counters on `users/{uid}`, and it cancels jobs (worker and poster) only through the `cancelJob` callable (6a). The rules lock the server-owned `users` fields and deny the poster's direct `in-progress -> cancelled`. That flips the last KNOWN HOLE, "poster cannot cancel an in-progress job while escrow is held".

**Architecture:** Plan 6a (stacked below this branch) adds the callable `cancelJob({ jobId, reason }) -> { penaltyPoints, status: 'cancelled' | 'open' }`, the `onRatingCreated` aggregate trigger and the job counter trigger. These maintain `ratingAverage`, `totalRatings`, `penaltyPoints`, `ratingScore`, `activeJobCount` and `completedJobs`. This plan rewrites `src/services/cancel.service.ts` as a callable wrapper (lazy `firebase/functions`, errors through `src/lib/callableError.ts`) and switches `MyJobs.tsx` to it. It deletes the client reputation writers (`submitRating`'s users update, `incrementActiveJobs` / `decrementActiveJobs`), narrows `updateUserProfile` to profile fields, and locks the rules.

**Tech Stack:** React 19 + TypeScript, Firebase JS SDK (`firebase/firestore`, `firebase/functions`), Vitest (`unit`, `rules` projects), `@firebase/rules-unit-testing` on the Firestore emulator (`demo-unijob`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 6; testing rules in section 5). Design decisions: orchestrator slice-6 design, sections "Reputation model" and "6b" (server contract in "6a").

All `Run:` lines are relative to the worktree root. `<EMULATOR_CONFIG>` is the emulator `firebase.json` the orchestrator supplies for this worktree.

## Global Constraints

- Server contract (6a): callable `cancelJob`, region `asia-southeast1`, request `{ jobId: string; reason: CancelReason }`, response `{ penaltyPoints: number; status: 'cancelled' | 'open' }`. The caller must be a verified `@hcmut.edu.vn` member (`requireVerifiedMember`). The cases:
  - Poster cancels an `open` job: `cancelled`, penalty 0.
  - Poster cancels an `in-progress` job: `cancelled`, penalty 5, held escrow refunded.
  - Worker (`assignedTo[0]`) cancels an `in-progress` job: `open`, penalty 20 / 10 / 5 when the deadline is under 12 h / under 24 h / later or absent away; the application becomes `rejected` and the poster gets `worker_cancelled`.
  - The job is denied with `failed-precondition` when a trusted completion has `workerConfirmed` (`Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.`) or the payment is `disputed`.
- Server-owned `users` fields (Reputation model): `ratingAverage`, `totalRatings`, `penaltyPoints`, `ratingScore = round1(max(0, ratingAverage - 0.1 * penaltyPoints))`, `activeJobCount`, `completedJobs`. Spec slice 6 adds `xp`, `level`, `badges`, `role`.
- Callable errors arrive as `FirebaseError` with `code` `functions/<code>`. Show a server message verbatim only when it is in the known-message set. Otherwise show the local Vietnamese text for user-facing codes, and otherwise the fallback `Có lỗi xảy ra khi hủy công việc.` (today's toast).
- UI copy is Vietnamese. Services own Firestore/functions access; pages stay thin; types live in `src/types`.
- Keep `firebase/functions` out of the entry chunk (dynamic `import()`), or the `bundle-budget` gate fails.
- Unit tests go in `unijob-web/tests/unit/` mirroring `src/`; rules tests go in `unijob-web/tests/rules/`. Never weaken a test. A flipped KNOWN HOLE becomes `it` plus a sanity `assertSucceeds` in the same setup. A test asserting a client write that is now removed is replaced by a test asserting the write is denied (rules) or absent (unit).
- `src/services/cancel.service.ts` leaves `ci/coverage-legacy.json` in Task 3 and must then have at least 70% line coverage. `rating.service.ts` and `user.service.ts` stay legacy.
- Conventional Commits, message ends `[task:N]`, no `Co-Authored-By`. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact tree. Task 1 (rules) and Task 4 (last) also run `node scripts/ci-local.mjs --full` (needs Java 11 or later).
- Do not change `unijob-web/functions/**`.

## `users/{uid}` field inventory (who writes what today)

The only client writers of `users` are these:
- `auth.service.ts` `signInWithGoogle`: first sign-in `setDoc`, only when the doc does not exist.
- `Profile.tsx` `handleSave` through `user.service.ts` `updateUserProfile`.
- `bookmark.service.ts` `toggleBookmark` (`updateDoc`).
- `rating.service.ts` `submitRating`: the rated user's doc, already denied today and caught.
- `cancel.service.ts` through `updateUserProfile`.

`incrementActiveJobs` and `decrementActiveJobs` in `user.service.ts` have no callers. Gamification (`gamification.service.ts`) computes `xp`, `level` and `badges` in memory from jobs and ratings and never stores them. `getMaxJobLimit` (`lib/utils.ts`) is not called.

| Field | Written by the client today | After 6b |
|---|---|---|
| `uid` | first sign-in (`= auth uid`) | create: must equal `{userId}`; update: locked |
| `email`, `photoURL` | first sign-in | owner-editable (identity binding is a backlog item, Task 4) |
| `displayName`, `faculty`, `department`, `studentId`, `phone`, `bio`, `skills` | first sign-in, Profile edit | owner-editable |
| `bookmarks` | first sign-in `[]`, `toggleBookmark` | owner-editable |
| `isAnonymous` | first sign-in `false` | owner-editable |
| `createdAt`, `updatedAt` | first sign-in, `updateUserProfile` | owner-editable (unchanged) |
| `ratingScore` | first sign-in `0`; `submitRating` (denied); `cancel.service` | server; create `0` or absent; update locked |
| `totalRatings` | first sign-in `0`; `submitRating` (denied) | server; create `0` or absent; update locked |
| `activeJobCount` | first sign-in `0`; `cancel.service`; dead `increment*` helpers | server; create `0` or absent; update locked |
| `maxJobLimit` | first sign-in `2` | create `2` or absent; update locked (nobody maintains it yet; locking stops owners from raising their own limit) |
| `ratingAverage`, `penaltyPoints`, `completedJobs` | never (new, 6a) | server; create `0` or absent; update locked |
| `xp`, `level`, `badges`, `role` | never | server or future; create must be absent; update locked |

Nothing legitimate breaks. The first sign-in payload already uses the defaults, and Profile edit and bookmarks touch only owner-editable fields. Pinned by sanity tests in Task 1.

## Deploy order (goes in the PR body)

1. 6a functions first: `cd unijob-web && npx firebase deploy --only functions` (`cancelJob`, `onRatingCreated`, job counter trigger).
2. Then 6b rules and hosting together: `npx firebase deploy --only firestore:rules`, then `npm run build && npx firebase deploy --only hosting`.

Between steps 1 and 2, old tabs still cancel with direct writes, and the old rules allow those writes. The server counters then see `in-progress -> cancelled` and stay consistent, but no penalty and no refund happen. After step 2, an old open tab's in-progress cancel is denied and shows the generic error until reload. The old `submitRating` users write was already denied and is caught. Profile edits keep working.

## Decisions

1. **One callable for every cancel, including the poster's `open -> cancelled`.** The client no longer writes `status: 'cancelled'`. The rule keeps `open -> cancelled` (design: it stays allowed, harmless, and old tabs use it), but the guard test forbids the client write.
2. **`cancelSuccessMessage(result)` derives the role from `result.status`.** `open` means a worker cancel and `cancelled` means a poster cancel, so the page passes nothing else. The copy keeps today's strings.
3. **The server computes everything.** `cancelJob` takes `(jobId, reason)` only. The page no longer passes `applicationId`, worker uid, deadline or `hasAssignedWorker`.
4. **`CancelReason` and `CancelJobResult` move to `src/types/job.ts`.** `cancel.service.ts` re-exports `CancelReason` for existing imports.
5. **`updateUserProfile` takes `ProfileEditInput`, not `Partial<User>`.** The compiler then rejects any future client write of a locked field through it.
6. **`worker_cancelled` (NotificationType + icon) comes from 6a, not this branch.** `functions/tests/unit/parity.test.ts` asserts that the functions `NotificationType` equals the web union. 6a must therefore add `worker_cancelled` to `src/types/notification.ts`, and then to `NotificationBell.tsx` `iconByType` (a `Record` over the union, or web `tsc` fails). If this branch also added it, the functions parity test would fail on this branch (no functions changes allowed). Task 4 verifies that 6a has it.
7. **`cancelledBy` on jobs is server-only.** 6a writes `cancelledBy: 'poster'`. The poster may not set or change it, the same as `cancelReason`.

## File Structure

| File | Change | Task |
|---|---|---|
| `unijob-web/firestore.rules` | `users` create defaults + update lock; `posterStatusChangeOk` drops `in-progress -> cancelled`; `cancelledBy` server-only | 1 |
| `unijob-web/tests/rules/firestore.rules.test.ts` | `users` describe rewritten; flip KNOWN HOLE; `in-progress -> cancelled` denied; `cancelledBy` test | 1 |
| `docs/backlog/security-holes.md` | remove the fixed pinned hole and the "Worker cancel" bullet | 1 |
| `unijob-web/src/types/job.ts`, `src/types/index.ts` | `CancelReason`, `CancelJobResult` | 2 |
| `unijob-web/src/services/cancel.service.ts` | add callable wrapper + messages (old functions stay until Task 3) | 2 |
| `unijob-web/tests/unit/services/cancel.service.test.ts` | new describes for the callable | 2 |
| `unijob-web/src/pages/MyJobs.tsx` | cancel through `cancelJob`; modal copy + busy state | 3 |
| `unijob-web/src/services/cancel.service.ts`, its test, `ci/coverage-legacy.json` | delete `workerCancelJob` / `posterCancelJob`; leave legacy list | 3 |
| `unijob-web/src/types/user.ts`, `src/types/index.ts` | new optional server fields, `ProfileEditInput` | 4 |
| `unijob-web/src/services/user.service.ts`, `src/services/rating.service.ts` | drop counter helpers and the users aggregate write | 4 |
| `unijob-web/tests/unit/services/rating.service.test.ts`, `tests/unit/services/user.service.test.ts` (create), `tests/unit/services/reputation.guard.test.ts` (create) | tests | 4 |
| `docs/backlog/security-holes.md` (new bullets), `CHANGELOG.md` | docs | 4 |

## Parallelism

- **Tasks 1 and 2** touch disjoint files and can run as parallel workers in separate worktrees cut from this branch.
- **Task 3** depends on Task 2 (`cancelJob`, `cancelSuccessMessage`, `cancelErrorMessage`, `isCancelPreconditionFailed`).
- **Task 4** depends on Task 3: the guard test requires that `workerCancelJob` and `posterCancelJob` are gone and that `cancel.service.ts` no longer imports `user.service`, which allows narrowing `updateUserProfile`. Task 4 edits a different part of `docs/backlog/security-holes.md` than Task 1. It runs `--full` for the whole branch, so run it last.

## Review Focus

1. **Penalty reset by the owner.** Writing `penaltyPoints: 0`, deleting it with `deleteField()`, or overwriting the whole profile with the first-sign-in payload (`setDoc` on an existing doc drops `penaltyPoints`) must all be denied. Pinned in Task 1.
2. **Double tap on "Xác nhận Hủy", or a cancel from a stale list.** The job is already `open` or `cancelled`, or another tab cancelled it. The button is disabled while the call runs. A late repeat gets the server's `failed-precondition` text (or the local text), then the list refreshes and the modal closes. Pinned by `isCancelPreconditionFailed` and `cancelErrorMessage` tests (Task 2) and the busy state (Task 3).
3. **Worker cancels after reporting completion, or a payment is disputed.** The server's `Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.` (and 6a's disputed string) pass through verbatim. Pinned in Task 2.
4. **Hosting deployed before the callable exists, or the wrong region.** The SDK raises `functions/not-found` with message `not-found`. The toast must show the local Vietnamese text, never `not-found`. Pinned in Task 2.
5. **Legacy forged reputation.** Under the old rules any owner could set their own `ratingScore` or `activeJobCount`. The new rules only stop future writes, and 6a recomputes `ratingScore` only on the next rating. Task 4 records a pre-deploy recompute/audit item in the backlog, so nobody assumes stored values are trustworthy.

---

### Task 1: Rules lock server-owned `users` fields and the poster's in-progress cancel (flip the last KNOWN HOLE)

**Independent of Tasks 2 to 4.**

**Files:**
- Modify: `unijob-web/firestore.rules:13-19` (users), `:23-33` (jobs header + `posterStatusChangeOk`), `:78-79` (`cancelReason` lock)
- Modify: `unijob-web/tests/rules/firestore.rules.test.ts:71-81` (`users` describe), `:228-236` (KNOWN HOLE), `:257-260` (`in-progress -> cancelled is allowed`), `:446-450` (test name), new `cancelledBy` test after `:276`
- Modify: `docs/backlog/security-holes.md` ("Pinned by `it.fails`", "Not yet pinned by tests")

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `users.create`: owner only. `uid` must be absent or equal `{userId}`. `ratingScore`, `ratingAverage`, `totalRatings`, `penaltyPoints`, `activeJobCount`, `completedJobs` must be absent or `0`, and `maxJobLimit` absent or `2`. `xp`, `level`, `badges`, `role` must be absent.
  - `users.update`: owner only, and the affected keys exclude `uid` and every field above.
  - `jobs`: the poster's status change to `cancelled` only from `open`. `cancelledBy` is never written by a client.

- [ ] **Step 1: Change the tests first**

Replace `describe('users', …)` (lines 71-81). Keep the three existing tests unchanged and add:

```ts
  // Since slice 6 the server (Cloud Functions) owns reputation and job counters on users/{uid}.
  const SERVER_OWNED = ['ratingScore', 'ratingAverage', 'totalRatings', 'penaltyPoints', 'activeJobCount', 'completedJobs', 'maxJobLimit', 'xp', 'level', 'badges', 'role', 'uid'];
  // exact shape of signInWithGoogle (auth.service.ts)
  const signIn = (uid: string) => ({
    uid, email: `${uid}@hcmut.edu.vn`, displayName: uid, photoURL: '', faculty: '', department: '', studentId: '',
    phone: '', bio: '', skills: [], bookmarks: [], ratingScore: 0, totalRatings: 0, activeJobCount: 0, maxJobLimit: 2,
    isAnonymous: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const seedReputation = () =>
    env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'users/alice'), {
        ratingScore: 3.2, ratingAverage: 4.2, totalRatings: 5, penaltyPoints: 10, activeJobCount: 1, completedJobs: 4, maxJobLimit: 2,
      }),
    );

  it('the first sign-in payload (signInWithGoogle) is allowed, also without the default fields', async () => {
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), signIn('newbie')));
    const { ratingScore: _r, totalRatings: _t, activeJobCount: _a, maxJobLimit: _m, ...bare } = signIn('newbie2');
    await assertSucceeds(setDoc(doc(as('newbie2'), 'users/newbie2'), bare));
  });
  it('a user cannot create a profile for someone else or with a foreign uid', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/eve'), signIn('eve')));
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), uid: 'bob' }));
  });
  it.each([
    ['ratingScore', 5], ['ratingAverage', 5], ['totalRatings', 10], ['penaltyPoints', -20], ['activeJobCount', -5],
    ['completedJobs', 50], ['maxJobLimit', 99], ['ratingScore', '0'],
    ['xp', 0], ['level', 1], ['badges', []], ['role', 'admin'],
  ])('first sign-in cannot seed %s = %j', async (field, value) => {
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), [field]: value }));
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), signIn('newbie'))); // sanity: same doc, defaults
  });
  it.each(SERVER_OWNED)('the owner cannot change %s on their own profile', async (field) => {
    await seedReputation();
    const value = field === 'badges' ? ['fake'] : field === 'role' || field === 'uid' ? 'admin' : 0;
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { [field]: value }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', [field]: value, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', updatedAt: serverTimestamp() })); // sanity
  });
  it('the owner cannot reset penalties by deleting the field or overwriting the profile', async () => {
    await seedReputation();
    const ref = doc(as('alice'), 'users/alice');
    await assertFails(updateDoc(ref, { penaltyPoints: deleteField() }));
    await assertFails(updateDoc(ref, { ratingScore: deleteField(), totalRatings: deleteField() }));
    await assertFails(setDoc(ref, signIn('alice'))); // setDoc on an existing doc is an update that drops penaltyPoints
    await assertSucceeds(getDoc(ref)); // sanity
  });
  it('profile edit (Profile.handleSave) and bookmarks still work on a profile with server fields', async () => {
    await seedReputation();
    const ref = doc(as('alice'), 'users/alice');
    await assertSucceeds(updateDoc(ref, {
      displayName: 'Alice N', faculty: 'CSE', department: 'KHMT', studentId: '2212345', phone: '0901', bio: 'hi',
      skills: ['react', 'figma'], updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { bookmarks: arrayUnion('job1') }));
    await assertSucceeds(updateDoc(ref, { bookmarks: arrayRemove('job1') }));
  });
```

Add `arrayUnion, arrayRemove` to the `firebase/firestore` import.

Jobs: replace the KNOWN HOLE at lines 228-236 with:

```ts
  it('poster cannot cancel an in-progress job while escrow is held (only the cancelJob callable)', async () => {
    await seedJob('paid', { status: 'in-progress', assignedTo: ['carol'], paymentStatus: 'held' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments/paidpay'), {
        jobId: 'paid', payerId: 'poster', payeeId: 'carol', amount: 100_000, status: 'held',
      });
    });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/paid'), { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/paid'), { status: 'cancelled' }));
    // sanity: the same poster still cancels an open job in the same setup, and still edits the in-progress one
    await seedJob('paidopen', { status: 'open' });
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/paidopen'), { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/paid'), { title: 'Mới', updatedAt: serverTimestamp() }));
  });
```

Replace `it('in-progress -> cancelled is allowed', …)` (lines 257-260) with `it('in-progress -> cancelled is denied (only the cancelJob callable)', …)`. It uses the same seed, `assertFails(setStatus('ipj', 'cancelled'))`, and a sanity `assertSucceeds(setStatus('job1', 'cancelled'))`.

After `the poster cannot change or remove a server-set cancelReason` add:

```ts
    it('only the server sets cancelledBy', async () => {
      await seedJob('cb', { status: 'open' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cb'), { status: 'cancelled', cancelledBy: 'worker' }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cb'), { cancelledBy: 'poster' }));
      await seedJob('cbx', { status: 'cancelled', cancelledBy: 'poster' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cbx'), { cancelledBy: deleteField() }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cbx'), { title: 'Mới' })); // sanity
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cb'), { status: 'cancelled' })); // sanity
    });
```

Rename the test at line 446 to `existing client poster writes still pass (updateJob attachments, open cancel)`. Its body is unchanged (`job1` is open).

- [ ] **Step 2: Run the rules tests to verify the new expectations fail**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`
Expected: these FAIL:
- `first sign-in cannot seed …` (every row)
- `a user cannot create … foreign uid`
- `the owner cannot change …` (every field)
- `the owner cannot reset penalties …`
- `poster cannot cancel an in-progress job while escrow is held …`
- `in-progress -> cancelled is denied …`
- `only the server sets cancelledBy`

The sign-in, profile-edit and bookmark sanity tests pass.

- [ ] **Step 3: Change the rules**

`users`, comment `// USERS: ai đăng nhập cũng đọc; chủ tài khoản sửa hồ sơ. Uy tín, điểm phạt, bộ đếm job (và xp/level/badges/role) chỉ server ghi.`:
- `function serverOwnedUserKeys()` returns the 11 field names from Interfaces plus `'uid'`.
- `function createDefaultsOk(d)`:
  - `d.get(k, 0) == 0` for `ratingScore`, `ratingAverage`, `totalRatings`, `penaltyPoints`, `activeJobCount`, `completedJobs`
  - `d.get('maxJobLimit', 2) == 2`
  - `!d.keys().hasAny(['xp', 'level', 'badges', 'role'])`
- `allow create: if isOwner(userId) && request.resource.data.get('uid', userId) == userId && createDefaultsOk(request.resource.data);`
- `allow update: if isOwner(userId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(serverOwnedUserKeys());`

`jobs`:
- `posterStatusChangeOk`: the last line becomes `|| (from == 'open' && to == 'cancelled');`.
- Header comment lines 23-25 become:
  ```
  // chuyển trạng thái của người đăng: open -> in-progress (chỉ trong cùng lần ghi giao việc), open -> cancelled.
  // Hủy job đang làm chỉ qua callable cancelJob (phạt, hoàn ký quỹ). 'completed' chỉ server ghi. paymentStatus chỉ server ghi.
  // Không bao giờ quay lại 'open' (người làm hủy: server mở lại job).
  ```
- Line 78-79: `// cancelReason, cancelledBy chỉ server ghi` and `hasAny(['cancelReason', 'cancelledBy'])`.

- [ ] **Step 4: Run the rules tests to verify they pass**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`
Expected: PASS. `rg -n "it\.fails" unijob-web/tests/rules` prints nothing.

- [ ] **Step 5: Update the backlog**

In `docs/backlog/security-holes.md`:
- "Pinned by `it.fails`": delete item 1. Put `None open.` above the "When you fix one…" paragraph, and keep that paragraph.
- "Not yet pinned by tests": delete the **Worker cancel** bullet and the **Cancel after the worker confirmed** bullet if they are still there. 6a removes them too, and the identical removal merges cleanly.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests in full).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/firestore.rules unijob-web/tests/rules/firestore.rules.test.ts docs/backlog/security-holes.md
git commit -m "fix(rules): lock server-owned user fields and in-progress cancels [task:1]"
```

---

### Task 2: `cancelJob` callable wrapper and cancel types

**Independent of Tasks 1, 3, 4.**

**Files:**
- Modify: `unijob-web/src/types/job.ts`, `unijob-web/src/types/index.ts:2`
- Modify: `unijob-web/src/services/cancel.service.ts` (add; the old functions stay until Task 3)
- Test: `unijob-web/tests/unit/services/cancel.service.test.ts` (add describes; keep the old ones)

**Interfaces:**
- Consumes: callable `cancelJob` (6a), default export `app` of `@/lib/firebase`, `callableErrorMessage` and `UserFacingCode` from `@/lib/callableError`.
- Produces:
  - `src/types/job.ts` defines these, both exported from `@/types`:
    - `type CancelReason = 'Không thể hoàn thành đúng deadline' | 'Yêu cầu công việc thay đổi quá nhiều' | 'Lý do cá nhân khẩn cấp' | 'Khác'`
    - `interface CancelJobResult { penaltyPoints: number; status: 'cancelled' | 'open' }`
  - `cancel.service.ts` exports:
    - `export type { CancelReason }` (re-export)
    - `CANCEL_REASONS: readonly CancelReason[]` (the four, in that order)
    - `CANCEL_FALLBACK_ERROR = 'Có lỗi xảy ra khi hủy công việc.'`
    - `CANCEL_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>>`
    - `CANCEL_SERVER_MESSAGES: ReadonlySet<string>`
    - `cancelJob(jobId: string, reason: CancelReason): Promise<CancelJobResult>`
    - `cancelSuccessMessage(result: CancelJobResult): string`
    - `cancelErrorMessage(err: unknown): string`
    - `isCancelPreconditionFailed(err: unknown): boolean`

- [ ] **Step 1: Collect the exact server messages**

Read (read-only) the 6a plan `docs/plans/2026-10-25-server-reputation.md`. It is on branch `feat/server-reputation`, or in the worktree `.worktrees/reputation` while 6a is in progress. Also read the callable source on that branch: `git grep -n "HttpsError" feat/server-reputation -- unijob-web/functions/src`. Note every Vietnamese string that `cancelJob` throws. Together with the shared `lib/auth.ts` strings these form `CANCEL_SERVER_MESSAGES`.

The set must contain at least:
- `Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.`
- `Không tìm thấy công việc.`
- `Bạn cần đăng nhập để thực hiện thao tác này.`
- `Bạn không có quyền thực hiện thao tác này với công việc này.`
- `Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.`

Also add 6a's disputed-payment, wrong-status and invalid-reason strings. If neither the plan nor the branch has them yet, use exactly the five above and say so in the commit body.

- [ ] **Step 2: Write the failing test**

Append to `cancel.service.test.ts`. Add a `firebase/functions` mock with a hoisted `callable` and an `@/lib/firebase` mock (`{ default: 'APP', db: {} }`), as in `completion.service.test.ts`:

```ts
describe('cancelJob', () => {
  it('calls cancelJob in asia-southeast1 with only jobId and reason and returns the server result', async () => {
    callable.mockResolvedValue({ data: { penaltyPoints: 10, status: 'open' } });
    await expect(cancelJob('j1', 'Khác')).resolves.toEqual({ penaltyPoints: 10, status: 'open' });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'cancelJob');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1', reason: 'Khác' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(cancelJob('j1', 'Khác')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
  it('offers exactly the four reasons the server accepts', () => {
    expect(CANCEL_REASONS).toEqual(['Không thể hoàn thành đúng deadline', 'Yêu cầu công việc thay đổi quá nhiều', 'Lý do cá nhân khẩn cấp', 'Khác']);
  });
});

describe('cancelSuccessMessage', () => {
  it.each([
    [{ status: 'open', penaltyPoints: 20 }, 'Hủy sát giờ — bạn bị trừ 20 điểm uy tín.'],
    [{ status: 'open', penaltyPoints: 10 }, 'Đã hủy — bạn bị trừ 10 điểm uy tín.'],
    [{ status: 'open', penaltyPoints: 5 }, 'Đã hủy — bạn bị trừ 5 điểm uy tín.'],
    [{ status: 'cancelled', penaltyPoints: 5 }, 'Đã hủy việc — bạn bị trừ 5 điểm uy tín vì đã có người nhận việc.'],
    [{ status: 'cancelled', penaltyPoints: 0 }, 'Đã hủy việc thành công.'],
    [{ status: 'open', penaltyPoints: 0 }, 'Đã hủy việc thành công.'],
  ] as const)('%j -> %s (penalty from the server)', (result, text) => {
    expect(cancelSuccessMessage(result)).toBe(text);
  });
});

describe('cancelErrorMessage', () => {
  it('passes every known server message through', () => {
    for (const m of [
      'Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.',
      'Không tìm thấy công việc.',
      'Bạn cần đăng nhập để thực hiện thao tác này.',
      'Bạn không có quyền thực hiện thao tác này với công việc này.',
      'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
    ]) expect(CANCEL_SERVER_MESSAGES.has(m)).toBe(true);
    for (const message of CANCEL_SERVER_MESSAGES) {
      expect(cancelErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(cancelErrorMessage(err)).toBe(CANCEL_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(CANCEL_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(CANCEL_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(cancelErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(CANCEL_FALLBACK_ERROR);
    expect(cancelErrorMessage(new Error('network'))).toBe(CANCEL_FALLBACK_ERROR);
  });
});

describe('isCancelPreconditionFailed', () => {
  it('is true only for functions/failed-precondition', () => {
    expect(isCancelPreconditionFailed({ code: 'functions/failed-precondition', message: 'x' })).toBe(true);
    expect(isCancelPreconditionFailed({ code: 'functions/permission-denied' })).toBe(false);
    expect(isCancelPreconditionFailed(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/cancel.service.test.ts`
Expected: FAIL. `cancelJob` (and the other new names) are not exported.

- [ ] **Step 4: Implement**

- Types as in Interfaces. `src/types/index.ts` line 2 also exports `CancelReason, CancelJobResult`.
- `cancel.service.ts` drops its local `CancelReason` and instead imports it from `@/types` and re-exports it. `CancelResult` and the old functions stay until Task 3.
- Add the callable wrapper, structured like `completion.service.ts`:
  - lazy `await import('firebase/functions')`
  - `httpsCallable<{ jobId: string; reason: CancelReason }, CancelJobResult>(getFunctions(app, 'asia-southeast1'), 'cancelJob')`
  - returns `data`
  - Doc comment: the server checks the caller, applies the penalty, refunds held escrow, reopens the job (worker) or cancels it (poster), and notifies the other side.
- Exact copy:

```ts
export const CANCEL_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Yêu cầu hủy công việc không hợp lệ.',
  'not-found': 'Không tìm thấy công việc.',
  'permission-denied': 'Bạn không có quyền hủy công việc này.',
  'failed-precondition': 'Công việc không còn ở trạng thái có thể hủy.',
  unauthenticated: 'Bạn cần đăng nhập để hủy công việc.',
};
```

  - `CANCEL_SERVER_MESSAGES`: the strings from Step 1, with a comment naming the 6a source files.
  - `cancelErrorMessage` delegates to `callableErrorMessage`.
  - `cancelSuccessMessage` returns the strings from the tests. For `status === 'open'`: `>= 20` gives the "sát giờ" text, `> 0` gives "Đã hủy — …", and `0` gives "Đã hủy việc thành công.". For `cancelled`: `> 0` gives the poster penalty text, otherwise "Đã hủy việc thành công.".

- [ ] **Step 5: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/services/cancel.service.ts src/types/job.ts src/types/index.ts`
Expected: PASS, clean. The old `posterCancelJob` / `workerCancelJob` tests still pass.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/src/services/cancel.service.ts unijob-web/src/types/job.ts unijob-web/src/types/index.ts unijob-web/tests/unit/services/cancel.service.test.ts
git commit -m "feat(cancel): add the cancelJob callable client [task:2]"
```

---

### Task 3: MyJobs cancels through the callable; delete the client cancel writers

**Depends on Task 2.**

**Files:**
- Modify: `unijob-web/src/pages/MyJobs.tsx:18` (import), `:181-262` (`CancelModal`), `:584-622` (cancel handler)
- Modify: `unijob-web/src/services/cancel.service.ts` (delete `workerCancelJob`, `posterCancelJob`, `CancelResult`, the `user.service` / `job.service` imports)
- Modify: `unijob-web/tests/unit/services/cancel.service.test.ts`
- Modify: `ci/coverage-legacy.json` (remove `"unijob-web/src/services/cancel.service.ts",`)

**Interfaces:**
- Consumes: `cancelJob`, `cancelSuccessMessage`, `cancelErrorMessage`, `isCancelPreconditionFailed`, `CANCEL_REASONS`, `CancelReason` (Task 2).
- Produces: `cancel.service.ts` exports exactly the Task 2 names, plus the `CancelReason` type. It imports neither `@/services/user.service`, `@/services/job.service` nor `firebase/firestore`. No source file mentions `workerCancelJob` or `posterCancelJob`.

- [ ] **Step 1: Update the tests first**

In `cancel.service.test.ts`:
- Replace the `user.service` and `job.service` mocks with throwing mocks: `throw new Error('cancel.service must not import user.service (the server applies penalties)')` and `… job.service (the server changes job and application status)`. Keep the `notification.service` throwing mock.
- Delete `describe('posterCancelJob', …)`, `describe('workerCancelJob', …)` and their imports. The penalty-by-deadline cases are the server's (6a unit tests). The client is pinned by `cancelSuccessMessage` and by the Task 1 denials.
- Add:

```ts
describe('cancel.service exports', () => {
  it('has no client cancel writers (the cancelJob callable owns them)', () => {
    expect(Object.keys(service).sort()).toEqual([
      'CANCEL_CODE_MESSAGES', 'CANCEL_FALLBACK_ERROR', 'CANCEL_REASONS', 'CANCEL_SERVER_MESSAGES',
      'cancelErrorMessage', 'cancelJob', 'cancelSuccessMessage', 'isCancelPreconditionFailed',
    ]);
  });
});
```

(`import * as service from '@/services/cancel.service'`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/cancel.service.test.ts`
Expected: FAIL with "cancel.service must not import user.service".

- [ ] **Step 3: Implement**

`cancel.service.ts`: delete `CancelResult`, `workerCancelJob`, `posterCancelJob` and the two service imports.

`MyJobs.tsx`:
- Line 18 imports `cancelJob, cancelErrorMessage, cancelSuccessMessage, isCancelPreconditionFailed, CANCEL_REASONS, type CancelReason` from `@/services/cancel.service`.
- `CancelModal` changes:
  - New props: `role: 'worker' | 'poster'` and `onNext: (reason: CancelReason) => Promise<void>`.
  - The select lists `CANCEL_REASONS`. `selectedReason` is `CancelReason | ''`.
  - A `submitting` state wraps `await onNext(selectedReason)` (`finally` resets it). The "Xác nhận Hủy" button is disabled while `!selectedReason || submitting` and shows `Đang hủy...` while submitting.
  - The warning list is replaced by role-specific items. These are the exact copy (the old "giới hạn đăng bài trong 3 ngày" line is false and goes away):
    - worker: `Hủy khi còn dưới 12 tiếng đến hạn chót: -20 điểm uy tín.`, `Còn dưới 24 tiếng: -10 điểm uy tín. Còn lâu hơn hoặc không có hạn chót: -5 điểm uy tín.`, `Không thể hủy sau khi bạn đã báo hoàn thành.`
    - poster: `Hủy khi đã có người nhận việc: -5 điểm uy tín và hoàn lại tiền ký quỹ.`, `Không thể hủy sau khi người làm đã báo hoàn thành; hãy xác nhận hoặc báo tranh chấp.`
- Render with `role={cancelJobTarget.type}`. The handler becomes:
  ```ts
  try {
    const result = await cancelJob(cancelJobTarget.job.id, reason);
    toast.success(cancelSuccessMessage(result));
    close();
    loadJobs();
  } catch (err) {
    console.error(err);
    toast.error(cancelErrorMessage(err));
    if (isCancelPreconditionFailed(err)) {
      close();
      loadJobs();
    }
  }
  ```
  Here `close` sets `cancelStep` 0 and `cancelJobTarget` null.
- Drop `rawDeadline` from `ReceivedJob` and its mapping if nothing else uses it. `applicationId` and `hasAssignedWorker` stay if other code reads them; otherwise drop them too.

`ci/coverage-legacy.json`: remove the `cancel.service.ts` line.

- [ ] **Step 4: Verify**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/pages/MyJobs.tsx src/services/cancel.service.ts && node -e "JSON.parse(require('fs').readFileSync('../ci/coverage-legacy.json','utf8'))"`
Expected: PASS, clean. `rg -n "workerCancelJob|posterCancelJob" unijob-web/src` prints nothing.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS. `cancel.service.ts` is at 70% or more line coverage, and `bundle-budget` shows `firebase/functions` only in a lazy chunk.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/pages/MyJobs.tsx unijob-web/src/services/cancel.service.ts unijob-web/tests/unit/services/cancel.service.test.ts ci/coverage-legacy.json
git commit -m "feat(cancel): cancel jobs through the server and drop client penalties [task:3]"
```

---

### Task 4: Drop the remaining client reputation writes, source guard, docs

**Depends on Task 3.**

**Files:**
- Modify: `unijob-web/src/types/user.ts`, `unijob-web/src/types/index.ts:1`
- Modify: `unijob-web/src/services/user.service.ts:1, 17-46`
- Modify: `unijob-web/src/services/rating.service.ts:1-11, 41-56`
- Modify: `unijob-web/tests/unit/services/rating.service.test.ts`
- Test (create): `unijob-web/tests/unit/services/user.service.test.ts`, `unijob-web/tests/unit/services/reputation.guard.test.ts`
- Modify: `docs/backlog/security-holes.md` ("Not yet pinned by tests", "Before deploying these rules"), `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3 removed the last non-Profile caller of `updateUserProfile`.
- Produces:
  - `src/types/user.ts`: `User` gains optional `ratingAverage?: number; penaltyPoints?: number; completedJobs?: number;`. Doc comments on these and on `ratingScore`, `totalRatings`, `activeJobCount` say "do server ghi (Cloud Functions)". `ratingScore` is "ratingAverage trừ 0.1 × penaltyPoints, tối thiểu 0".
  - `export type ProfileEditInput = Partial<Pick<User, 'displayName' | 'photoURL' | 'faculty' | 'department' | 'studentId' | 'phone' | 'bio' | 'skills' | 'isAnonymous'>>`, exported from `@/types`.
  - `user.service.ts` exports exactly `getUserById`, `updateUserProfile(userId: string, data: ProfileEditInput): Promise<void>` and `canAcceptMoreJobs`.
  - `rating.service.ts` `submitRating` writes only `ratings/{jobId}_{from}_{to}`.

- [ ] **Step 1: Write the failing tests**

`rating.service.test.ts`, add:

```ts
describe('submitRating', () => {
  it('writes only the rating doc; the server trigger updates the rated user', async () => {
    await expect(service.submitRating('j1', 'p', 'w', 5, 'tốt', 'poster-to-worker')).resolves.toBe('j1_p_w');
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith({ _path: 'ratings/j1_p_w' }, {
      jobId: 'j1', fromUserId: 'p', toUserId: 'w', score: 5, comment: 'tốt', type: 'poster-to-worker', createdAt: 'SERVER_TS',
    });
    expect(updateDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
```

The `doc` mock must return `{ _path, id }` so `docRef.id` resolves. Change it to `doc: vi.fn((_db, col: string, id: string) => ({ _path: `${col}/${id}`, id }))` and match with `expect.objectContaining({ _path: 'ratings/j1_p_w' })`.

`user.service.test.ts` (mock `firebase/firestore` and `@/lib/firebase` as in `rating.service.test.ts`):

```ts
describe('user.service', () => {
  it('has no counter writers (the server maintains activeJobCount)', () => {
    expect(Object.keys(service).sort()).toEqual(['canAcceptMoreJobs', 'getUserById', 'updateUserProfile']);
  });
  it('updateUserProfile writes the given profile fields plus updatedAt', async () => {
    await service.updateUserProfile('u1', { bio: 'hi', skills: ['a'] });
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/u1' }), { bio: 'hi', skills: ['a'], updatedAt: 'SERVER_TS' });
  });
  it('getUserById returns null for a missing doc and the profile otherwise', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(service.getUserById('x')).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: 'u1', data: () => ({ activeJobCount: 1, maxJobLimit: 2 }) } as never);
    await expect(service.canAcceptMoreJobs('u1')).resolves.toBe(true);
  });
});
```

`reputation.guard.test.ts` (reuse the `sourceFiles` walker from `completion.guard.test.ts`):

```ts
const CANCELLED_WRITE = /\b(updateJob|updateDoc|setDoc|addDoc|set|update)\s*\([^;]*?status:\s*['"]cancelled['"]/s;
const DEFAULTS: Record<string, string> = { ratingScore: '0', totalRatings: '0', activeJobCount: '0', maxJobLimit: '2', ratingAverage: '0', penaltyPoints: '0', completedJobs: '0' };

describe('the cancelled-write pattern', () => {
  it('matches writes and not reads', () => {
    expect(CANCELLED_WRITE.test("await updateJob(jobId, { status: 'cancelled' });")).toBe(true);
    expect(CANCELLED_WRITE.test("updateDoc(ref, {\n  status: 'cancelled',\n})")).toBe(true);
    expect(CANCELLED_WRITE.test("status === 'cancelled' ? 'Đã huỷ' : ''")).toBe(false);
  });
});

describe('no client code writes reputation, counters or cancels', () => {
  const files = sourceFiles(SRC);
  const rel = (f: string) => relative(SRC, f).replaceAll('\\', '/');
  it.each(files.map((f) => [rel(f), f]))('%s', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(workerCancelJob|posterCancelJob|incrementActiveJobs|decrementActiveJobs)\b/);
    expect(text).not.toMatch(CANCELLED_WRITE);
  });
  it('only auth, bookmark and user services touch the users collection', () => {
    expect(files.filter((f) => readFileSync(f, 'utf8').includes("'users'")).map(rel).sort())
      .toEqual(['services/auth.service.ts', 'services/bookmark.service.ts', 'services/user.service.ts']);
  });
  it('the first sign-in sets server-owned fields only to their defaults', () => {
    const text = readFileSync(join(SRC, 'services', 'auth.service.ts'), 'utf8');
    for (const [field, value] of Object.entries(DEFAULTS)) {
      for (const m of text.matchAll(new RegExp(`\\b${field}\\s*:\\s*([^,\\n]+)`, 'g'))) expect(m[1].trim()).toBe(value);
    }
    expect(text).not.toMatch(/\b(xp|level|badges|role)\s*:/);
  });
  it('bookmark.service writes only bookmarks; user.service takes ProfileEditInput and never increments', () => {
    const bookmark = readFileSync(join(SRC, 'services', 'bookmark.service.ts'), 'utf8');
    expect(bookmark).not.toMatch(new RegExp(`\\b(${Object.keys(DEFAULTS).join('|')})\\b`));
    const user = readFileSync(join(SRC, 'services', 'user.service.ts'), 'utf8');
    expect(user).toMatch(/updateUserProfile\(userId: string, data: ProfileEditInput\)/);
    expect(user).not.toMatch(/\bincrement\s*\(/);
  });
  it('cancel.service.ts has no Firestore or service imports', () => {
    expect(readFileSync(join(SRC, 'services', 'cancel.service.ts'), 'utf8')).not.toMatch(/firebase\/firestore|user\.service|job\.service/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/rating.service.test.ts tests/unit/services/user.service.test.ts tests/unit/services/reputation.guard.test.ts`
Expected: FAIL in these places:
- `submitRating` (`updateDoc` and `getDocs` are called)
- the `user.service` exports
- the `users` collection list (`rating.service.ts` is in it)
- `ProfileEditInput`
- `incrementActiveJobs` in `user.service.ts`

Both pattern self-tests and `cancel.service` pass.

- [ ] **Step 3: Implement**

- Types as in Interfaces.
- `user.service.ts`:
  - Delete `incrementActiveJobs`, `decrementActiveJobs` and the `increment` import.
  - `updateUserProfile(userId: string, data: ProfileEditInput)`.
  - Comment above it: `// Chỉ các trường hồ sơ; uy tín và bộ đếm job do server ghi (rules chặn).`
- `rating.service.ts`:
  - Delete the `try { … }` aggregate block (lines 41-56) and the now-unused `updateDoc` import.
  - Comment after the `setDoc`: `// Điểm trung bình và số đánh giá do trigger onRatingCreated (server) cập nhật.`
- `Profile.tsx` needs no change: its payload already fits `ProfileEditInput`, and `tsc` proves it.

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/services/user.service.ts src/services/rating.service.ts src/types/user.ts src/types/index.ts`
Expected: PASS, clean.

- [ ] **Step 5: Check `worker_cancelled` from 6a (Decision 6)**

Run: `git show feat/server-reputation:unijob-web/src/types/notification.ts` and `git show feat/server-reputation:unijob-web/src/components/layout/NotificationBell.tsx`
Expected: both contain `worker_cancelled`. If either is missing, or the branch does not exist yet, do not add it here. Report it to the orchestrator in the task summary: it belongs to 6a, and adding it here would break `functions/tests/unit/parity.test.ts`.

- [ ] **Step 6: Docs**

`docs/backlog/security-holes.md`:
- "Not yet pinned by tests", add these bullets:
  - `- **users identity fields** — owners can still rewrite \`email\`, \`displayName\` and \`photoURL\` on their own profile (only reputation, counters and \`uid\` are locked since slice 6). Bind \`email\` to the auth token and track with the users PII split (next spec).`
  - `- **maxJobLimit is not maintained** — locked at 2 for every user since slice 6 and not enforced anywhere (\`canAcceptMoreJobs\` has no caller). Decide server-side limits with the gamification spec.`
- "Before deploying these rules", add a paragraph:
  `**Legacy reputation.** Before slice 6 owners could write any field of their own profile, so stored \`ratingScore\`, \`totalRatings\`, \`activeJobCount\` (and \`maxJobLimit\`) may be forged. The rating trigger only recomputes a user on their next rating. After the 6a functions deploy, recompute \`ratingAverage\`/\`totalRatings\`/\`ratingScore\` from \`ratings\` and \`activeJobCount\`/\`completedJobs\` from \`jobs\` for every user (or reset \`maxJobLimit\` to 2) with an Admin SDK script, and review users whose stored values differ.`

`CHANGELOG.md` under `## [Unreleased]`:
- `### Fixed`: `- Người làm hủy việc giờ hoạt động (trước đây bị rules chặn): server mở lại job để tìm người khác, trừ điểm uy tín theo thời gian còn lại đến hạn chót và báo cho người đăng. Điểm trung bình đánh giá giờ được server cập nhật sau mỗi đánh giá.`
- `### Security`: `- Client không còn tự ghi điểm uy tín, số đánh giá, điểm phạt, số job đang làm/đã hoàn thành, giới hạn nhận việc, xp/level/huy hiệu/role trên hồ sơ (rules chặn, kể cả khi tạo hồ sơ lần đầu). Người đăng không tự hủy job đang làm được nữa: mọi lần hủy đi qua callable \`cancelJob\` (phạt, hoàn ký quỹ, chặn hủy khi người làm đã báo hoàn thành). Deploy functions trước, rồi rules và hosting cùng lúc.`

- [ ] **Step 7: Local CI (full: whole branch before push)**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests, functions-tests, coverage, build, `bundle-budget`).

- [ ] **Step 8: Commit**

```bash
git add unijob-web/src/types/user.ts unijob-web/src/types/index.ts unijob-web/src/services/user.service.ts unijob-web/src/services/rating.service.ts unijob-web/tests/unit/services/rating.service.test.ts unijob-web/tests/unit/services/user.service.test.ts unijob-web/tests/unit/services/reputation.guard.test.ts docs/backlog/security-holes.md CHANGELOG.md
git commit -m "refactor(reputation): drop client reputation and counter writes [task:4]"
```

---

## Self-review notes

- Design 6b coverage:
  - Item 1 (rules): Task 1. It covers the `users` update lock, the create defaults from the real `signInWithGoogle` payload, and denying the poster's `in-progress -> cancelled`. It flips the KNOWN HOLE with a sanity check (`open -> cancelled` in the same setup), tests every denied field, and keeps the profile-edit and bookmark sanity checks.
  - Item 2 (client): `cancel.service.ts` becomes a callable wrapper with lazy import, an allowlist and 70% coverage (Tasks 2 and 3). `MyJobs` shows the server penalty (Task 3). `submitRating` stops writing users, and the dead counter helpers are removed. A source guard covers it all (Task 4).
  - Item 3: the new user field types are in Task 4. `worker_cancelled` + icon are owned by 6a because of the parity test (Decision 6), and Task 4 Step 5 verifies them.
  - Item 4: backlog + CHANGELOG (Tasks 1 and 4); deploy order section.
- Spec slice 6 field list (`ratingScore`, `totalRatings`, `activeJobCount`, `xp`, `level`, `badges`, `role`, `completedJobs`) is fully locked. The plan adds `ratingAverage`, `penaltyPoints`, `maxJobLimit`, `uid`.
- Names match 6a: callable `cancelJob`, region `asia-southeast1`, `{ jobId, reason }` → `{ penaltyPoints, status }`, the `cancelledBy` server field, and the `Người làm đã báo hoàn thành. Hãy xác nhận hoặc báo tranh chấp.` string.
- After Task 1 no `it.fails('KNOWN HOLE …')` remains in `tests/rules`.
- PR body: base branch `feat/server-reputation`, deploy order, old-tab behaviour.
