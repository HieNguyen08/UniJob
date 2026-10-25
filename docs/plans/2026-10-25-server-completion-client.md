---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-completion-client
base: feat/server-completion
slice: 5b (spec section 3, slice 5 "server completion", client + rules half)
stacked-on: docs/plans/2026-10-25-server-completion.md
---

# Client stops writing completion (slice 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web client stops creating or updating `jobCompletions`, never writes `workHistory`, and never sets `jobs.status = 'completed'`. Worker and poster confirm through the `confirmCompletion` callable (5a). The rules deny those writes. That flips KNOWN HOLEs "poster cannot mark a job completed directly" and "a poster-fabricated completion cannot unlock rating", and closes the unpinned `workHistory.create` hole.

**Architecture:** Plan 5a (stacked below this branch) adds the callable `confirmCompletion({ jobId }) -> { status: 'pending' | 'confirmed', workerConfirmed, posterConfirmed }`. In one transaction it records the caller's side. Once both sides have confirmed, it sets the completion to `confirmed`, sets the job to `completed` and writes `workHistory/{jobId}_{worker}`. The existing triggers then send notifications and release the escrow. This plan adds `src/services/completion.service.ts` (lazy `firebase/functions`, error mapping via `src/lib/callableError.ts`) and switches `MyJobs.tsx` and `MyJobAcceptance.tsx` to it. It also deletes the client writers in `rating.service.ts` and `workHistory.service.ts` and locks the rules.

**Tech Stack:** React 19 + TypeScript, Firebase JS SDK (`firebase/firestore`, `firebase/functions`), Vitest (`unit`, `rules` projects), `@firebase/rules-unit-testing` on the Firestore emulator (`demo-unijob`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 5; testing rules in section 5). Design decisions: orchestrator slice-5 design, section "5b" (server contract in "5a").

All `Run:` lines are relative to the worktree root. `<EMULATOR_CONFIG>` is the emulator `firebase.json` the orchestrator supplies for this worktree.

## Global Constraints

- Server contract (5a): callable `confirmCompletion`, region `asia-southeast1`, request `{ jobId: string }`, response `{ status: 'pending' | 'confirmed'; workerConfirmed: boolean; posterConfirmed: boolean }`. The caller must be a verified `@hcmut.edu.vn` member (`requireVerifiedMember`). The job must be `in-progress` (`failed-precondition`). A poster calling on a missing completion gets `failed-precondition` with `Người làm chưa báo hoàn thành công việc.`. Repeating one's own confirmation is idempotent (it returns the current state).
- The server writes `jobCompletions/{jobId}` with `source: 'server'`, `createdAt`, `updatedAt`, and `workHistory/{jobId}_{worker}` with `source: 'server'`.
- Callable errors arrive as `FirebaseError` with `code` `functions/<code>`. Show a server message verbatim only when it is in the known-message set. Otherwise show the local Vietnamese text for user-facing codes, and otherwise the fallback `Không thể xác nhận hoàn thành, thử lại`.
- UI copy is Vietnamese. Services own Firestore/functions access; pages stay thin; types live in `src/types`.
- Keep `firebase/functions` out of the entry chunk (dynamic `import()`), or the `bundle-budget` gate fails.
- New unit tests go in `unijob-web/tests/unit/` mirroring `src/`; rules tests in `unijob-web/tests/rules/`. Never weaken a test. A flipped KNOWN HOLE becomes `it` plus a sanity `assertSucceeds` in the same setup. A test asserting a client write that is now removed is replaced by a test asserting the write is denied.
- `src/services/completion.service.ts` needs at least 70% line coverage. `rating.service.ts` and `workHistory.service.ts` stay in `ci/coverage-legacy.json` (not all of their remaining read paths are unit-tested).
- Conventional Commits, message ends `[task:N]`, no `Co-Authored-By`. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact tree. Task 1 (rules) and Task 4 (last) also run `node scripts/ci-local.mjs --full` (needs Java 11 or later).
- Do not change `unijob-web/functions/**`.

## Deploy order (goes in the PR body)

1. 5a functions first: `cd unijob-web && npx firebase deploy --only functions` (`confirmCompletion`).
2. Then 5b rules and hosting together: `npx firebase deploy --only firestore:rules`, then `npm run build && npx firebase deploy --only hosting`.

Deploying the rules before the functions would break completion for everyone: the client write is denied and no callable exists yet. Between steps 1 and 2, old tabs keep using the old client writes, which still work under the old rules. After step 2, an old open tab gets a generic error on "Báo hoàn thành" until it is reloaded.

## Decisions

1. **The callable wrapper lives in a new `completion.service.ts`, not in `rating.service.ts`.** The new file falls under the 70% gate, and `rating.service.ts` keeps only ratings and the `getJobCompletion` read.
2. **`completionSuccessMessage(result, role)` is in the service.** The pages stay thin and the copy for `pending` vs `confirmed` is unit-tested.
3. **The poster calls the callable with `job.id`, not `completion.id`.** They are the same id since slice 3, and the callable takes `jobId`.
4. **Legacy `workHistory` docs (random ids, no `source`) stay readable and untouched.** Reads in `workHistory.service.ts` do not change. A job with a legacy entry is already completed, so it never gets a server entry as well.

## File Structure

| File | Change | Task |
|---|---|---|
| `unijob-web/firestore.rules` | `jobCompletions` create/update false; `workHistory` create false; drop `in-progress -> completed` from `posterStatusChangeOk` | 1 |
| `unijob-web/tests/rules/firestore.rules.test.ts` | flip 2 KNOWN HOLEs, rewrite `jobCompletions` describe, new `workHistory` describe | 1 |
| `docs/backlog/security-holes.md` | remove fixed holes and the `workHistory.create` bullet | 1 |
| `unijob-web/src/types/rating.ts`, `src/types/index.ts` | `ConfirmCompletionResult`; `JobCompletion` server fields | 2 |
| `unijob-web/src/services/completion.service.ts` (create) | callable wrapper + messages | 2 |
| `unijob-web/tests/unit/services/completion.service.test.ts` (create) | tests | 2 |
| `unijob-web/src/pages/MyJobs.tsx`, `src/pages/MyJobAcceptance.tsx` | use `completion.service` | 3 |
| `unijob-web/src/services/rating.service.ts`, `src/services/workHistory.service.ts` | delete client writers | 4 |
| `unijob-web/tests/unit/services/rating.service.test.ts`, `rating.completion.test.ts` | follow the change | 4 |
| `unijob-web/tests/unit/services/completion.guard.test.ts` (create) | source scan | 4 |
| `docs/backlog/security-holes.md` ("Before deploying these rules"), `CHANGELOG.md` | legacy note, Vietnamese entry | 4 |

## Parallelism

- **Tasks 1 and 2** touch disjoint files and can run as parallel workers in separate worktrees cut from this branch.
- **Task 3** depends on Task 2 (`completion.service.ts`).
- **Task 4** depends on Task 3: the pages must stop importing `createJobCompletion` and `rating.service`'s `confirmCompletion` before those are deleted. Task 4 edits a different section of `docs/backlog/security-holes.md` than Task 1. It also runs `--full` for the whole branch, so run it last.

## Review Focus

1. Hosting deployed before the callable exists (or the wrong region): the SDK raises `functions/not-found` with message `not-found`. The toast must show the local Vietnamese text, never `not-found`. Pinned in Task 2.
2. The worker taps "Gửi báo cáo & Hoàn tất" twice, or reports again after a successful report. The button is disabled while the call runs. A repeat gets the server's idempotent `pending` and the same "Chờ người đăng xác nhận" toast, never an error. Pinned by `completionSuccessMessage` tests (Task 2) and the `submitting` state (Task 3).
3. The poster cancelled the job (or it already completed) in another tab, and the worker then reports. The server's `failed-precondition` message is shown verbatim when it is known, otherwise the local text. The worker's list refreshes only after a success. Pinned in Task 2.
4. The poster forces "Xác nhận" before the worker reported (the button is disabled, but the page state is stale). The server's `Người làm chưa báo hoàn thành công việc.` passes through. Pinned in Task 2; Task 3 reloads the completion after an error so the timeline is current.
5. The source guard must catch real writes but not reads: `updateJob(id, { status: 'completed' })` is flagged, `getJobs({ status: 'completed' })` in `CVExport.tsx` is not. Pinned by the regex self-test in Task 4.

---

### Task 1: Rules deny client completion, workHistory and `completed` writes (flip 2 KNOWN HOLEs)

**Independent of Tasks 2 to 4.**

**Files:**
- Modify: `unijob-web/firestore.rules:23-34` (jobs header + `posterStatusChangeOk`), `:186-250` (`jobCompletions`, `workHistory`)
- Modify: `unijob-web/tests/rules/firestore.rules.test.ts:220-223` (jobs KNOWN HOLE), `:777-915` (`jobCompletions` describe), `:1079-1088` (ratings KNOWN HOLE), new `workHistory` describe after `jobCompletions`
- Modify: `docs/backlog/security-holes.md` (sections "Pinned by `it.fails`" and "Not yet pinned by tests")

**Interfaces:**
- Consumes: nothing.
- Produces: `jobCompletions` and `workHistory` writes denied for every client; poster `in-progress -> completed` denied. Reads unchanged (`jobCompletions` get for poster/assigned worker, list denied; `workHistory` read for signed-in users).

- [ ] **Step 1: Change the tests first**

Jobs, replace the KNOWN HOLE at lines 220-223 with:

```ts
  it('poster cannot mark a job completed directly (only the confirmCompletion callable)', async () => {
    await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { status: 'completed' }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('carol'), 'jobs/ipj'), { status: 'completed', updatedAt: serverTimestamp() }));
    // sanity: other poster edits on the same in-progress job still work
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/ipj'), { title: 'Mới', updatedAt: serverTimestamp() }));
  });
```

Ratings, replace the KNOWN HOLE at lines 1079-1088 with `it('a poster-fabricated completion cannot unlock rating', …)`. Keep the same accept step (`assertSucceeds` on `{ assignedTo: ['carol'], status: 'in-progress' }`), then:

```ts
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { status: 'completed' }));
    await assertFails(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
    // sanity: once the server completes the job, the same rating is allowed
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'jobs/job1'), { status: 'completed' }));
    await assertSucceeds(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
```

Replace `describe('jobCompletions', …)` (lines 777-915):
- Keep its `fresh`, `job` and `beforeEach` seeds as they are.
- Change the header comment to `// Since slice 5 only the confirmCompletion callable writes completions (Admin SDK). Clients only get jobCompletions/{jobId}.`
- Add `const server = (jobId: string) => ({ ...fresh(jobId), source: 'server', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });`.

The new tests follow. Every former `assertSucceeds` write becomes `assertFails`, and each test keeps a read sanity check:

```ts
  it('no client can create a completion, not even the assigned worker (the old createJobCompletion payload)', async () => {
    for (const uid of ['worker', 'poster', 'mallory']) {
      await assertFails(setDoc(doc(as(uid), 'jobCompletions/newjob'), fresh('newjob')));
      await assertFails(setDoc(doc(as(uid), 'jobCompletions/newjob'), server('newjob')));
    }
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/newjob'), { ...fresh('newjob'), workerConfirmed: true }));
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/newjob'))); // sanity: the worker is a member of newjob
  });
  it('neither side can confirm its own flag (the old confirmCompletion first-confirmer writes)', async () => {
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true }));
    await assertFails(updateDoc(doc(as('poster'), 'jobCompletions/cjob'), { posterConfirmed: true }));
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/cjob'))); // sanity
    await assertSucceeds(getDoc(doc(as('poster'), 'jobCompletions/cjob'))); // sanity
  });
  it('the old second-confirmer writes are denied (worker last and poster last)', async () => {
    await assertFails(
      updateDoc(doc(as('worker'), 'jobCompletions/pdjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as('poster'), 'jobCompletions/wdjob'), { posterConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertSucceeds(getDoc(doc(as('poster'), 'jobCompletions/wdjob'))); // sanity
  });
  it('outsiders cannot confirm or forge a completion', async () => {
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/cjob'), { posterConfirmed: true, status: 'confirmed' }));
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/c1'), { workerConfirmed: true }));
    await assertFails(setDoc(doc(as('mallory'), 'jobCompletions/random-id'), fresh('newjob')));
  });
  it('a server-written completion cannot be reopened, re-stamped or have source changed', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'jobCompletions/cjob'), { ...server('cjob'), workerConfirmed: true, posterConfirmed: true, status: 'confirmed' }),
    );
    const ref = doc(as('poster'), 'jobCompletions/cjob');
    await assertSucceeds(getDoc(ref)); // sanity
    await assertFails(updateDoc(ref, { status: 'pending' }));
    await assertFails(updateDoc(ref, { completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { source: 'client' }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { posterConfirmed: false }));
  });
```

Keep these unchanged: `only the poster and the assigned worker can get a completion (getJobCompletion)`, `listing completions is denied, even filtered by jobId`, `nobody can delete a completion`. Delete the other old tests: they all asserted client writes, and the new tests above deny the same writes with equal or stricter coverage.

Add after it:

```ts
describe('workHistory', () => {
  // Since slice 5 only the confirmCompletion callable writes workHistory/{jobId}_{worker}.
  const entry = { user1: 'poster', user2: 'worker', jobId: 'cjob', jobTitle: 'x', category: 'it' };
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'workHistory/cjob_worker'), { ...entry, completedAt: serverTimestamp(), source: 'server' }),
    );
  });
  it('no client can create work history (the old recordWorkHistory payload, any id)', async () => {
    for (const uid of ['poster', 'worker', 'mallory']) {
      await assertFails(setDoc(doc(as(uid), `workHistory/forged_${uid}`), { ...entry, completedAt: Timestamp.now() }));
      await assertFails(setDoc(doc(as(uid), 'workHistory/newjob_worker'), { ...entry, jobId: 'newjob', completedAt: serverTimestamp(), source: 'server' }));
    }
  });
  it('signed-in users read work history; signed-out cannot', async () => {
    await assertSucceeds(getDoc(doc(as('mallory'), 'workHistory/cjob_worker')));
    await assertSucceeds(getDocs(query(collection(as('poster'), 'workHistory'), where('user1', '==', 'poster'))));
    await assertFails(getDoc(doc(anon(), 'workHistory/cjob_worker')));
  });
  it('nobody updates or deletes work history', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'workHistory/cjob_worker'), { jobTitle: 'sửa' }));
    await assertFails(deleteDoc(doc(as('worker'), 'workHistory/cjob_worker')));
  });
});
```

- [ ] **Step 2: Run the rules tests to verify the new expectations fail**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`
Expected: FAIL in exactly `poster cannot mark a job completed directly…`, `a poster-fabricated completion cannot unlock rating`, the first three new `jobCompletions` tests and `no client can create work history…`. Read, list and delete tests pass.

- [ ] **Step 3: Change the rules**

- `posterStatusChangeOk`: delete `|| (from == 'in-progress' && to == 'completed')`. Header comment line 24 becomes `// open/in-progress -> cancelled. 'completed' chỉ server ghi (callable confirmCompletion). paymentStatus chỉ server ghi.`
- `jobCompletions`: delete the helpers that only create/update use (`ownSideOnly`, `confirmOk`, `completionUpdateOk`). Keep `completionJob`, `isAssignedWorker`, `isJobPoster`, `isJobMember` for `get`. Rules: `allow get` unchanged, `allow list: if false;`, `allow create, update, delete: if false;`. Comment: `// JOB COMPLETIONS: một bản ghi mỗi job tại jobCompletions/{jobId}. Chỉ người đăng và người được giao việc đọc (get). Mọi ghi do callable confirmCompletion (Admin SDK) thực hiện.`
- `workHistory`: `allow read: if isAuth(); allow create, update, delete: if false;` with comment `// WORK HISTORY: ai đăng nhập cũng đọc. Chỉ server ghi (callable confirmCompletion, id {jobId}_{worker}).`

- [ ] **Step 4: Run the rules tests to verify they pass**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`
Expected: PASS. The only remaining `it.fails('KNOWN HOLE …')` is the slice 6 cancel one, which still fails as expected.

- [ ] **Step 5: Update the backlog**

`docs/backlog/security-holes.md`:
- "Pinned by `it.fails`": delete items 1 and 2; renumber the cancel item as 1.
- "Not yet pinned by tests": delete the **workHistory.create** bullet. Also delete the **Second-confirmer completion** bullet if it is still there. 5a removes it too, and the identical removal merges cleanly.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests in full).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/firestore.rules unijob-web/tests/rules/firestore.rules.test.ts docs/backlog/security-holes.md
git commit -m "fix(rules): deny client completion, work history and completed status writes [task:1]"
```

---

### Task 2: `completion.service` (callable wrapper) and `ConfirmCompletionResult`

**Independent of Tasks 1, 3, 4.**

**Files:**
- Modify: `unijob-web/src/types/rating.ts`, `unijob-web/src/types/index.ts:3`
- Create: `unijob-web/src/services/completion.service.ts`
- Test (create): `unijob-web/tests/unit/services/completion.service.test.ts`

**Interfaces:**
- Consumes: callable `confirmCompletion` (5a), default export `app` of `@/lib/firebase`, `callableErrorMessage` and `UserFacingCode` from `@/lib/callableError`.
- Produces:
  - `src/types/rating.ts`: `interface ConfirmCompletionResult { status: 'pending' | 'confirmed'; workerConfirmed: boolean; posterConfirmed: boolean }`, exported from `@/types`; `JobCompletion` gains optional `source?: 'server'; createdAt?: Timestamp; updatedAt?: Timestamp`.
  - `src/services/completion.service.ts`: `COMPLETION_FALLBACK_ERROR = 'Không thể xác nhận hoàn thành, thử lại'`, `COMPLETION_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>>`, `COMPLETION_SERVER_MESSAGES: ReadonlySet<string>`, `confirmCompletion(jobId: string): Promise<ConfirmCompletionResult>`, `completionErrorMessage(err: unknown): string`, `completionSuccessMessage(result: ConfirmCompletionResult, role: 'worker' | 'poster'): string`.

- [ ] **Step 1: Collect the exact server messages**

Read (read-only) the 5a plan `docs/plans/2026-10-25-server-completion.md` and the callable source on its branch: `git grep -n "HttpsError" feat/server-completion -- unijob-web/functions/src` and `git show feat/server-completion:unijob-web/functions/src/lib/auth.ts`. Note every Vietnamese string that `confirmCompletion`, `assertMember` and `requireVerifiedMember` throw. These form `COMPLETION_SERVER_MESSAGES`.

The set must contain at least these five:
- `Người làm chưa báo hoàn thành công việc.`
- `Không tìm thấy công việc.`
- `Bạn cần đăng nhập để thực hiện thao tác này.`
- `Bạn không có quyền thực hiện thao tác này với công việc này.`
- `Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.`

The last four come from `lib/auth.ts` and are already in `DISPUTE_SERVER_MESSAGES`. Also add 5a's "job not in progress" and invalid-request strings. If neither the plan nor the branch is available, use exactly the five above and say so in the commit body.

- [ ] **Step 2: Write the failing test**

`unijob-web/tests/unit/services/completion.service.test.ts`, mocks as in `dispute.service.test.ts` (`firebase/functions` with a hoisted `callable`, `@/lib/firebase` default `'APP'`):

```ts
describe('confirmCompletion', () => {
  it('calls confirmCompletion in asia-southeast1 with only the jobId and returns the server state', async () => {
    callable.mockResolvedValue({ data: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
    await expect(confirmCompletion('j1')).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect(getFunctions).toHaveBeenCalledWith('APP', 'asia-southeast1');
    expect(httpsCallable).toHaveBeenCalledWith('FUNCTIONS', 'confirmCompletion');
    expect(callable).toHaveBeenCalledWith({ jobId: 'j1' });
  });
  it('propagates callable errors', async () => {
    callable.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/failed-precondition' }));
    await expect(confirmCompletion('j1')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

describe('completionSuccessMessage', () => {
  const done = { status: 'confirmed', workerConfirmed: true, posterConfirmed: true } as const;
  const waiting = { status: 'pending', workerConfirmed: true, posterConfirmed: false } as const;
  it.each(['worker', 'poster'] as const)('confirmed (%s) says the job is complete and rating is open', (role) => {
    expect(completionSuccessMessage(done, role)).toBe('Công việc đã hoàn thành! Bạn có thể đánh giá ngay.');
  });
  it('pending for the worker (first report or an idempotent repeat) says to wait for the poster', () => {
    expect(completionSuccessMessage(waiting, 'worker')).toBe('Đã gửi báo cáo hoàn thành! Chờ người đăng xác nhận.');
  });
  it('pending for the poster says to wait for the worker', () => {
    expect(completionSuccessMessage({ ...waiting, workerConfirmed: false, posterConfirmed: true }, 'poster'))
      .toBe('Đã xác nhận. Đang chờ người làm báo hoàn thành.');
  });
});

describe('completionErrorMessage', () => {
  it('passes every known server message through', () => {
    for (const m of [
      'Người làm chưa báo hoàn thành công việc.',
      'Không tìm thấy công việc.',
      'Bạn cần đăng nhập để thực hiện thao tác này.',
      'Bạn không có quyền thực hiện thao tác này với công việc này.',
      'Bạn cần đăng nhập bằng email @hcmut.edu.vn đã xác minh để thực hiện thao tác này.',
    ]) expect(COMPLETION_SERVER_MESSAGES.has(m)).toBe(true);
    for (const message of COMPLETION_SERVER_MESSAGES) {
      expect(completionErrorMessage({ code: 'functions/failed-precondition', message })).toBe(message);
    }
  });
  it.each([
    [{ code: 'functions/not-found', message: 'not-found' }, 'not-found'], // callable not deployed / wrong region
    [{ code: 'functions/failed-precondition', message: 'FAILED_PRECONDITION' }, 'failed-precondition'],
    [{ code: 'functions/permission-denied', message: 'Thông điệp lạ' }, 'permission-denied'],
  ] as const)('uses the local Vietnamese text for %j', (err, code) => {
    expect(completionErrorMessage(err)).toBe(COMPLETION_CODE_MESSAGES[code]);
  });
  it('has Vietnamese text for every user-facing code and falls back otherwise', () => {
    expect(Object.keys(COMPLETION_CODE_MESSAGES).sort()).toEqual(
      ['failed-precondition', 'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated'],
    );
    for (const m of Object.values(COMPLETION_CODE_MESSAGES)) expect(m).toMatch(/[ạ-ỹđ]/);
    expect(completionErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(COMPLETION_FALLBACK_ERROR);
    expect(completionErrorMessage(new Error('network'))).toBe(COMPLETION_FALLBACK_ERROR);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/completion.service.test.ts`
Expected: FAIL, cannot resolve `@/services/completion.service`.

- [ ] **Step 4: Implement**

- Types as in Interfaces. `src/types/index.ts` line 3 also exports `ConfirmCompletionResult`.
- `completion.service.ts`, structured like `dispute.service.ts`: lazy `await import('firebase/functions')`, `httpsCallable<{ jobId: string }, ConfirmCompletionResult>(getFunctions(app, 'asia-southeast1'), 'confirmCompletion')`, returns `data`. Doc comment: the server records the caller's side and, once both sides have confirmed, completes the job, writes work history and releases escrow. Exact copy:

```ts
export const COMPLETION_CODE_MESSAGES: Readonly<Record<UserFacingCode, string>> = {
  'invalid-argument': 'Yêu cầu xác nhận hoàn thành không hợp lệ.',
  'not-found': 'Không tìm thấy công việc.',
  'permission-denied': 'Bạn không có quyền xác nhận hoàn thành công việc này.',
  'failed-precondition': 'Công việc không còn ở trạng thái có thể xác nhận hoàn thành.',
  unauthenticated: 'Bạn cần đăng nhập để xác nhận hoàn thành.',
};
```

  - `COMPLETION_SERVER_MESSAGES`: the strings from Step 1, with a comment naming the 5a source files.
  - `completionErrorMessage`: delegates to `callableErrorMessage` with these constants.
  - `completionSuccessMessage`: returns the three strings from the tests.

- [ ] **Step 5: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/services/completion.service.ts src/types/rating.ts src/types/index.ts`
Expected: PASS, clean.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS, `completion.service.ts` at 70% or more line coverage.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/src/services/completion.service.ts unijob-web/src/types/rating.ts unijob-web/src/types/index.ts unijob-web/tests/unit/services/completion.service.test.ts
git commit -m "feat(completion): add the confirmCompletion callable client [task:2]"
```

---

### Task 3: MyJobs and MyJobAcceptance confirm through the callable

**Depends on Task 2.**

**Files:**
- Modify: `unijob-web/src/pages/MyJobs.tsx:11, 97-117` (`ReportModal.handleSubmit`)
- Modify: `unijob-web/src/pages/MyJobAcceptance.tsx:5, 50-63` (`handleConfirm`)

**Interfaces:**
- Consumes: `confirmCompletion(jobId)`, `completionErrorMessage(err)`, `completionSuccessMessage(result, role)` from `@/services/completion.service` (Task 2); `getJobCompletion` from `@/services/rating.service` (unchanged).
- Produces: neither page imports `createJobCompletion` or `rating.service`'s `confirmCompletion`. UI only.

- [ ] **Step 1: Implement**

`MyJobs.tsx`:
- Line 11 imports only `getJobCompletion` from `rating.service`. Add an import of `confirmCompletion, completionErrorMessage, completionSuccessMessage` from `@/services/completion.service`.
- `handleSubmit` becomes `const result = await confirmCompletion(job.id); toast.success(completionSuccessMessage(result, 'worker')); onSubmitted(); onClose();`.
- On error: `console.error(err); toast.error(completionErrorMessage(err));`, and keep the modal open.
- `finally setSubmitting(false)`. The button is already disabled while `submitting`.

`MyJobAcceptance.tsx`:
- Line 5 imports only `getJobCompletion`. Add an import of the three names from `completion.service`.
- `handleConfirm`: guard with `if (!job || !completion?.workerConfirmed) return;`, then `const result = await confirmCompletion(job.id); toast.success(completionSuccessMessage(result, 'poster')); navigate('/my-jobs');`.
- On error: `toast.error(completionErrorMessage(err))`, then refresh the timeline with `setCompletion(await getJobCompletion(job.id).catch(() => completion))`.
- `finally setConfirming(false)`.

- [ ] **Step 2: Verify**

Run: `cd unijob-web && npx tsc -b && npx eslint src/pages/MyJobs.tsx src/pages/MyJobAcceptance.tsx && npx vitest run --project unit`
Expected: clean, PASS. `rg -n "createJobCompletion|from '@/services/rating.service'" unijob-web/src/pages` shows only `getJobCompletion` imports.

- [ ] **Step 3: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS (`bundle-budget`: `firebase/functions` still only in a lazy chunk).

- [ ] **Step 4: Commit**

```bash
git add unijob-web/src/pages/MyJobs.tsx unijob-web/src/pages/MyJobAcceptance.tsx
git commit -m "feat(completion): confirm job completion through the server from both pages [task:3]"
```

---

### Task 4: Delete the client completion writers, source guard, docs

**Depends on Task 3.**

**Files:**
- Modify: `unijob-web/src/services/rating.service.ts:13-15, 71-126`
- Modify: `unijob-web/src/services/workHistory.service.ts:1-10, 46-65`
- Modify: `unijob-web/tests/unit/services/rating.service.test.ts`, `unijob-web/tests/unit/services/rating.completion.test.ts`
- Test (create): `unijob-web/tests/unit/services/completion.guard.test.ts`
- Modify: `docs/backlog/security-holes.md` ("Legacy job completions" paragraph), `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3 removed every caller of `createJobCompletion`, `rating.service` `confirmCompletion`, `recordWorkHistory`.
- Produces: `rating.service.ts` exports exactly `submitRating`, `getRatingsByUser`, `getJobCompletion` and imports neither `job.service` nor `workHistory.service`. `workHistory.service.ts` exports `getWorkHistory`, `haveWorkedTogether`, `getSmartMatchedWorkers` and its types, with no Firestore write API.

- [ ] **Step 1: Update the tests first**

`rating.service.test.ts`:
- Replace the `job.service` mock with a throwing mock: `throw new Error('rating.service must not import job.service (the server completes the job)')`.
- Replace the `workHistory.service` mock the same way, with "(the server writes work history)".
- Delete the `getJobById`/`updateJob`/`recordWorkHistory` imports.
- Replace `describe('confirmCompletion', …)` with:

```ts
describe('rating.service exports', () => {
  it('has no completion writers (the confirmCompletion callable owns them)', () => {
    expect(Object.keys(service).sort()).toEqual(['getJobCompletion', 'getRatingsByUser', 'submitRating']);
  });
});
```

(`import * as service from '@/services/rating.service'`.)

`rating.completion.test.ts`: use the same throwing mocks for `job.service` and `workHistory.service`. Delete `describe('createJobCompletion', …)`; the export test above, the guard below and the Task 1 denials pin it instead. Keep `describe('getJobCompletion', …)` unchanged.

`completion.guard.test.ts` (reuse the `sourceFiles` walker from `payment.service.test.ts`):

```ts
const COMPLETED_WRITE = /\b(updateJob|updateDoc|setDoc|addDoc|set|update)\s*\([^;]*?status:\s*['"]completed['"]/s;

describe('the completed-write pattern', () => {
  it('matches writes and not read filters', () => {
    expect(COMPLETED_WRITE.test("await updateJob(job.id, { status: 'completed' });")).toBe(true);
    expect(COMPLETED_WRITE.test("batch.update(ref, {\n  status: 'completed',\n});")).toBe(true);
    expect(COMPLETED_WRITE.test("getJobs({ status: 'completed' }),")).toBe(false);
  });
});

describe('no client code writes completions, work history or completed status', () => {
  const files = sourceFiles(SRC);
  it.each(files.map((f) => [relative(SRC, f), f]))('%s', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(createJobCompletion|recordWorkHistory)\b/);
    expect(text).not.toMatch(COMPLETED_WRITE);
  });
  it('only rating.service.ts touches jobCompletions, and only with getDoc', () => {
    const users = files.filter((f) => readFileSync(f, 'utf8').includes("'jobCompletions'")).map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(users).toEqual(['services/rating.service.ts']);
    const text = readFileSync(join(SRC, 'services', 'rating.service.ts'), 'utf8');
    const refs = text.match(/doc\(db,\s*'jobCompletions'/g) ?? [];
    const reads = text.match(/getDoc\(doc\(db,\s*'jobCompletions'/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(reads.length).toBe(refs.length);
  });
  it('workHistory.service.ts has no Firestore write API', () => {
    const text = readFileSync(join(SRC, 'services', 'workHistory.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/rating.service.test.ts tests/unit/services/rating.completion.test.ts tests/unit/services/completion.guard.test.ts`
Expected: FAIL. First "rating.service must not import job.service", then the export assertion, the `createJobCompletion|recordWorkHistory` and `COMPLETED_WRITE` checks (rating.service.ts) and the `addDoc` check (workHistory.service.ts). The pattern self-test passes.

- [ ] **Step 3: Implement**

- `rating.service.ts`: delete `createJobCompletion`, `confirmCompletion`, the `workHistory.service` and `job.service` imports, and any import names left unused. `getJobCompletion` already reads `getDoc(doc(db, 'jobCompletions', jobId))` inline, so the guard's ref/read count matches. Above `getJobCompletion` add: `// Xác nhận hoàn thành do callable confirmCompletion (completion.service) ghi; client chỉ đọc.`
- `workHistory.service.ts`: delete `recordWorkHistory` and the `addDoc` import (keep `Timestamp` as a type for `WorkHistoryEntry`). Above `workHistoryCollection` add: `// Lịch sử làm việc do server ghi (workHistory/{jobId}_{worker}); client chỉ đọc.`

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/services/rating.service.ts src/services/workHistory.service.ts`
Expected: PASS, clean.

- [ ] **Step 5: Docs**

`docs/backlog/security-holes.md`, append to the "Legacy job completions" paragraph: ` Since slice 5 the confirmCompletion callable updates a legacy completion already at jobCompletions/{jobId} (no source field) and writes workHistory/{jobId}_{worker}; random-id completions are still ignored. Legacy random-id workHistory entries stay readable and are never rewritten.`

`CHANGELOG.md` under `## [Unreleased]`:
- `### Added`: `- Xác nhận hoàn thành phía server: người làm "Báo hoàn thành" và người đăng "Xác nhận" qua callable \`confirmCompletion\`. Khi cả hai đã xác nhận, server chuyển job sang "đã hoàn thành", ghi lịch sử làm việc và giải ngân ký quỹ. Người làm xác nhận sau cùng giờ cũng hoàn tất được job.`
- `### Security`: `- Client không còn tạo/sửa \`jobCompletions\`, ghi \`workHistory\` hay tự chuyển job sang "đã hoàn thành" (rules chặn), nên người đăng không tự mở khoá đánh giá được nữa. Deploy functions trước, rồi rules và hosting cùng lúc.`

- [ ] **Step 6: Local CI (full: whole branch before push)**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (rules-tests, functions-tests, coverage, build, `bundle-budget`).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/src/services/rating.service.ts unijob-web/src/services/workHistory.service.ts unijob-web/tests/unit/services/rating.service.test.ts unijob-web/tests/unit/services/rating.completion.test.ts unijob-web/tests/unit/services/completion.guard.test.ts docs/backlog/security-holes.md CHANGELOG.md
git commit -m "refactor(completion): drop client completion and work history writes [task:4]"
```

---

## Self-review notes

- Design 5b coverage:
  - Item 1: rules for `jobCompletions`, `workHistory` and `posterStatusChangeOk`, plus both KNOWN HOLE flips with sanity checks (Task 1).
  - Item 2: `completion.service.ts` with lazy import, allowlist mapping and 70% coverage (Task 2); both pages (Task 3); `createJobCompletion`, the client `confirmCompletion` and `recordWorkHistory` removed, with a source scan (Task 4).
  - Item 3: backlog and CHANGELOG (Tasks 1 and 4).
  - Item 4: deploy order, functions first, then rules + hosting (Deploy order section).
- Names match 5a: callable `confirmCompletion`, region `asia-southeast1`, `{ jobId }` to `{ status, workerConfirmed, posterConfirmed }`, `workHistory/{jobId}_{worker}`, `source: 'server'`, `Người làm chưa báo hoàn thành công việc.`.
- KNOWN HOLE slice 6 (cancel while held) stays an `it.fails`; `in-progress -> cancelled` stays allowed.
- PR body: base branch `feat/server-completion`, deploy order, old-tab behaviour.
