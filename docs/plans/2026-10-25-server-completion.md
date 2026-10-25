---
status: approved
approved: 2026-10-25 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-completion
base: feat/server-escrow-client
slice: 5a (spec section 3, slice 5 "server completion", Cloud Functions half)
stacked-next: feat/server-completion-client (slice 5b: client + rules)
---

# Server completion (slice 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new callable `confirmCompletion({ jobId })` records the poster's or the assigned worker's confirmation in one transaction. When both sides have confirmed it marks the completion `confirmed`, the job `completed` and writes `workHistory/{jobId}_{worker}`, server-side. This also fixes the case the client could never do: the worker confirming last. Additive only: no web client, no rules change (that is 5b).

**Architecture:** Same shape as `disputePayment` (slice 4a). Pure, Admin-free rules live in `functions/src/lib/completion.ts` (input parsing, role/state checks, next completion state, work history record). `functions/src/handlers/confirmCompletion.ts` runs one Firestore transaction with every read before any write. `functions/src/callables/confirmCompletion.ts` is a thin `onCall` wrapper gated by `requireVerifiedMember`. The existing triggers react to the server writes and are not changed: `onJobCompletionWritten` sends `completion_requested`, `onJobUpdated` sends `job_completed`, and `onJobEscrow` releases held escrow on `-> completed`.

**Tech Stack:** firebase-functions 7.4.0 (v2 `https`), firebase-admin 14.5.0, TypeScript 5.9, Vitest (projects `unit` and `emulator`), Firestore emulator (project `demo-unijob`, database `kirigitejkf8095h`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 5; the decisions table in section 2; error handling in section 4). The orchestrator's slice 5 design (section 5a) is folded into "Decisions" below.

All `Run:` lines are relative to the worktree root (the directory that contains `unijob-web/` and `scripts/`). `<EMULATOR_CONFIG>` is the firebase config file the orchestrator gives each worker (alternate emulator ports). Use `firebase.json` when running alone.

## Global Constraints

- Region `asia-southeast1` (`REGION`), database `kirigitejkf8095h` (`DATABASE_ID`), both from `src/config.ts`. Never hard-code either string in `src/`.
- Emulator project id is always `demo-unijob`. Emulator tests connect only through `connectEmulatorDb()` (`functions/tests/support/emulatorDb.ts`), and the callable module is imported dynamically after it (as in `tests/emulator/disputes.emulator.test.ts`).
- Callables throw `HttpsError` with Vietnamese messages. Reuse `MSG_UNAUTHENTICATED`, `MSG_NOT_VERIFIED`, `MSG_NOT_MEMBER`, `MSG_JOB_NOT_FOUND` from `src/lib/auth.ts`. New messages are exactly the `COMPLETION_MSG` values in Task 1.
- Job titles stored by the server go through `safeTitle` (`src/lib/messages.ts`).
- Do not change `src/handlers/completions.ts`, `src/handlers/jobs.ts`, `src/handlers/payments.ts` or their triggers (design 5a.1).
- New `functions/src/**` files need at least 70% line coverage (unit + emulator projects together). Do not lower any threshold.
- Tests live in `unijob-web/functions/tests/unit/**` and `unijob-web/functions/tests/emulator/**`, never next to source. `firebase-functions-test` is not used: call v2 functions with `.run(request)`.
- Do not touch `unijob-web/src/**`, `unijob-web/firestore.rules` or `unijob-web/tests/**` (that is 5b).
- Conventional Commits, message ends with `[task:N]`, never a `Co-Authored-By` trailer. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact working tree. `git commit` is its own tool call.

## Decisions

1. **Response shape.** `ConfirmCompletionResult = { status: 'pending' | 'confirmed'; workerConfirmed: boolean; posterConfirmed: boolean }`, the state after the call.
2. **Check order inside the transaction** (an outsider learns nothing about the job's state): job missing → `not-found` (`MSG_JOB_NOT_FOUND`); `assertMember` on `toJobInfo` → `permission-denied` (`MSG_NOT_MEMBER`); role `worker` with `uid !== assignedTo[0]` (a second assignee) → `permission-denied` (`MSG_NOT_MEMBER`); `status === 'completed'` → `failed-precondition` (`alreadyCompleted`); any other status than `in-progress` → `failed-precondition` (`notInProgress`); `assignedTo[0]` not a valid doc id, `postedBy` not a valid doc id, or poster === worker → `failed-precondition` (`noWorker`). A completed job is always denied, including a repeat after success (design: "completed job denied"). The 5b client refreshes on that message.
3. **State transitions** (`nextCompletionStep`). Flags count only when `=== true` (junk such as `'true'` is false).
   - No doc: the worker creates `{ jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null, createdAt, updatedAt, source: 'server' }`. The poster gets `failed-precondition` (`workerFirst`).
   - Own flag already true and the other side not: no write. The current state is returned (idempotent).
   - Otherwise: own flag set to true, plus `jobId` and `updatedAt`. If both are now true: `status: 'confirmed'` and `completedAt` (an existing `Timestamp` is kept, else `serverTimestamp()`). The job gets `{ status: 'completed', updatedAt }` and the work history is written.
   - A legacy doc without `source` (written under the slice 3 rules, which enforced the shape) is updated in place. `source` is not added on update.
   - A **stuck legacy doc** (both flags true and `confirmed`, but the job is still `in-progress`, because the worker confirmed last under the old client) is finished by the next call from either side.
   - A poster confirming on an existing doc whose worker flag is still false is allowed. Only a *missing* doc is "worker first". This happens because the old client created the doc with both flags false.
4. **Work history** is at `workHistory/{jobId}_{workerId}` with `{ user1: postedBy, user2: workerId, jobId, jobTitle: safeTitle(title), category: string or '', completedAt: serverTimestamp(), source: 'server' }`. An existing doc with `source: 'server'` is kept as is. Any other doc at that id was forged under today's open `workHistory.create` rule and is replaced (same treatment as payments in 4a). Legacy random-id entries are not touched.
5. **Auth.** `requireVerifiedMember` (completion unlocks rating and releases escrow). No App Check yet, as for `disputePayment`.
6. **Emulator tests call the handler directly.** The auth denials go through `confirmCompletion.run(request)` on the emulator db (Task 3). The end-to-end flow (Task 4) chains the handler with the existing trigger handlers (`handleCompletionWritten`, `handleJobUpdated`, `handleEscrow`) using the real before/after data, without the Functions emulator.
7. **Deploy order** (README, Task 5): 5a functions first, then 5b `hosting,firestore:rules` together in one window. Deploying the rules before the functions would break completion for everyone.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `unijob-web/functions/src/lib/completion.ts` (create) | `COMPLETION_MSG`, `parseCompletionInput`, `completionParties`, `nextCompletionStep`, `workHistoryIdFor`, `planWorkHistory`, types | 1 |
| `unijob-web/functions/src/handlers/confirmCompletion.ts` (create) | `handleConfirmCompletion` (transaction) | 2 |
| `unijob-web/functions/src/callables/confirmCompletion.ts` (create) | `confirmCompletion` (onCall) | 3 |
| `unijob-web/functions/src/index.ts` (modify) | export `confirmCompletion` | 5 |
| `unijob-web/functions/README.md` (modify) | completion section + deploy order | 5 |
| `docs/backlog/security-holes.md` (modify) | remove "Second-confirmer completion" | 5 |

## Parallelism

- **Task 1** first (pure lib).
- **Task 2** needs Task 1.
- **Tasks 3 and 4** both need Task 2 and are independent of each other (disjoint files: Task 3 extends `confirmCompletion.emulator.test.ts`, Task 4 creates `completionFlow.emulator.test.ts`). Run them in parallel.
- **Task 5** last (needs 3; its docs describe 4).

## Review Focus

1. **The worker confirms last** (the old client could never do this): the poster confirms on a doc the old client created with both flags false, then the worker confirms → job `completed`, completion `confirmed`, work history written. Tested in Task 2.
2. **Concurrent double click by the second confirmer**: exactly one transaction finishes the job. The other gets `alreadyCompleted`, and there is exactly one `workHistory` doc for the job. Tested in Task 2.
3. **A stuck legacy doc** (both true, `confirmed`, job still `in-progress`): one call finishes it and keeps its `completedAt`. Tested in Task 2.
4. **Forged inputs**: junk flags (`'true'`), a forged `workHistory/{jobId}_{worker}` doc without `source: 'server'` (replaced), a second assignee, poster === worker, an outsider. None of them complete a job or skip a side. Tested in Tasks 1 and 2.
5. **The full trigger chain** on server writes: `completion_requested` once on the worker's confirmation, `job_completed` to both sides, held escrow `released`, and a volunteer job completing without a payment and without an error. Tested in Task 4.

---

### Task 1: Completion rules (`lib/completion.ts`)

**Files:**
- Create: `unijob-web/functions/src/lib/completion.ts`
- Test: `unijob-web/functions/tests/unit/completion.test.ts`

**Interfaces:**
- Consumes: `isDocId`, `toJobInfo`, `JobInfo` (`lib/jobs.ts`); `assertMember`, `MSG_JOB_NOT_FOUND`, `MSG_NOT_MEMBER` (`lib/auth.ts`); `MemberRole` (`lib/types.ts`); `safeTitle` (`lib/messages.ts`).
- Produces:
  - ```ts
    export const COMPLETION_MSG = {
      invalid: 'Yêu cầu không hợp lệ.',
      notInProgress: 'Chỉ có thể xác nhận hoàn thành khi công việc đang được thực hiện.',
      alreadyCompleted: 'Công việc này đã được xác nhận hoàn thành.',
      noWorker: 'Công việc này chưa có người làm hợp lệ.',
      workerFirst: 'Người làm chưa báo hoàn thành công việc.',
    } as const;
    ```
  - `interface CompletionState { status: 'pending' | 'confirmed'; workerConfirmed: boolean; posterConfirmed: boolean }`
  - `type ConfirmCompletionResult = CompletionState`
  - `type CompletionStep = { write: false; state: CompletionState } | { write: true; create: boolean; state: CompletionState }`
  - `parseCompletionInput(data: unknown): { jobId: string }` (throws `HttpsError('invalid-argument', COMPLETION_MSG.invalid)`)
  - `completionParties(jobId: string, job: DocumentData | undefined, uid: string): { role: MemberRole; info: JobInfo; workerId: string }` (Decision 2, in that order)
  - `nextCompletionStep(role: MemberRole, current: DocumentData | undefined): CompletionStep` (Decision 3; throws `failed-precondition` `workerFirst`)
  - `workHistoryIdFor(jobId: string, workerId: string): string` → `${jobId}_${workerId}`
  - `interface WorkHistoryFields { user1: string; user2: string; jobId: string; jobTitle: string; category: string; source: 'server' }` (the handler adds `completedAt`)
  - `planWorkHistory(info: JobInfo, job: DocumentData, workerId: string): WorkHistoryFields`

- [ ] **Step 1: Write the failing tests**

`unijob-web/functions/tests/unit/completion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER } from '../../src/lib/auth.js';
import {
  COMPLETION_MSG, completionParties, nextCompletionStep, parseCompletionInput, planWorkHistory, workHistoryIdFor,
} from '../../src/lib/completion.js';
import { toJobInfo } from '../../src/lib/jobs.js';

const job = { title: 'Nhập liệu', category: 'Gia sư', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'] };

describe('parseCompletionInput', () => {
  it('returns the job id', () => expect(parseCompletionInput({ jobId: 'j1' })).toEqual({ jobId: 'j1' }));
  it.each([['slash', { jobId: 'a/b' }], ['missing', {}], ['number', { jobId: 1 }], ['null', null], ['string', 'j1']])(
    'rejects %s with invalid-argument', (_l, data) => {
      expect(() => parseCompletionInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message: COMPLETION_MSG.invalid }));
    });
});

describe('completionParties', () => {
  it('poster and assigned worker get their role and the worker id', () => {
    expect(completionParties('j1', job, 'p1')).toMatchObject({ role: 'poster', workerId: 'w1', info: { postedBy: 'p1' } });
    expect(completionParties('j1', job, 'w1')).toMatchObject({ role: 'worker', workerId: 'w1' });
  });
  it.each([
    ['missing job', undefined, 'p1', 'not-found', MSG_JOB_NOT_FOUND],
    ['outsider (even on a completed job)', { ...job, status: 'completed' }, 'mallory', 'permission-denied', MSG_NOT_MEMBER],
    ['second assignee', { ...job, assignedTo: ['w1', 'w2'] }, 'w2', 'permission-denied', MSG_NOT_MEMBER],
    ['completed job', { ...job, status: 'completed' }, 'p1', 'failed-precondition', COMPLETION_MSG.alreadyCompleted],
    ['open job', { ...job, status: 'open' }, 'p1', 'failed-precondition', COMPLETION_MSG.notInProgress],
    ['cancelled job', { ...job, status: 'cancelled' }, 'w1', 'failed-precondition', COMPLETION_MSG.notInProgress],
    ['no worker', { ...job, assignedTo: [] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
    ['worker id with a slash', { ...job, assignedTo: ['a/b'] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
    ['poster is the worker', { ...job, assignedTo: ['p1'] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
  ])('%s -> %s', (_l, data, uid, code, message) => {
    expect(() => completionParties('j1', data, uid)).toThrow(expect.objectContaining({ code, message }));
  });
});

describe('nextCompletionStep', () => {
  const doc = (workerConfirmed: unknown, posterConfirmed: unknown, status = 'pending') => ({ jobId: 'j1', workerConfirmed, posterConfirmed, status });
  it('worker on no doc creates a pending record', () => {
    expect(nextCompletionStep('worker', undefined)).toEqual({ write: true, create: true, state: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
  });
  it('poster on no doc is failed-precondition (worker first)', () => {
    expect(() => nextCompletionStep('poster', undefined)).toThrow(expect.objectContaining({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst }));
  });
  it('own flag already true, other side not: no write (idempotent)', () => {
    expect(nextCompletionStep('worker', doc(true, false))).toEqual({ write: false, state: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
    expect(nextCompletionStep('poster', doc(false, true))).toEqual({ write: false, state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
  it.each([
    ['poster second', 'poster', doc(true, false)],
    ['worker second (old client doc)', 'worker', doc(false, true)],
    ['stuck legacy doc, poster', 'poster', doc(true, true, 'confirmed')],
    ['stuck legacy doc, worker', 'worker', doc(true, true, 'confirmed')],
  ] as const)('%s -> confirmed', (_l, role, current) => {
    expect(nextCompletionStep(role, current)).toEqual({ write: true, create: false, state: { status: 'confirmed', workerConfirmed: true, posterConfirmed: true } });
  });
  it('poster on an old-client doc with both flags false records only the poster', () => {
    expect(nextCompletionStep('poster', doc(false, false))).toEqual({ write: true, create: false, state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
  it('junk flag values count as false', () => {
    expect(nextCompletionStep('poster', doc('true', false))).toMatchObject({ state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
});

describe('work history', () => {
  it('id is `${jobId}_${workerId}`', () => expect(workHistoryIdFor('j1', 'w1')).toBe('j1_w1'));
  it('builds the server record with a safe title', () => {
    const data = { ...job, title: 'Xem www.evil.com' };
    expect(planWorkHistory(toJobInfo('j1', data)!, data, 'w1')).toEqual({
      user1: 'p1', user2: 'w1', jobId: 'j1', jobTitle: 'Xem [liên kết]', category: 'Gia sư', source: 'server',
    });
  });
  it('a non-string category becomes ""', () => {
    const data = { ...job, category: 42 };
    expect(planWorkHistory(toJobInfo('j1', data)!, data, 'w1').category).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/completion.test.ts`
Expected: FAIL, cannot resolve `src/lib/completion.js`.

- [ ] **Step 3: Implement `src/lib/completion.ts`**

The Interfaces above. `completionParties` uses `toJobInfo` then `assertMember` (it already throws `not-found` for a missing job), then the checks in Decision 2's order. `nextCompletionStep` reads the flags with `=== true` and derives `status` from the flags only (`confirmed` iff both are true). There is no db access and no Admin import in this file.

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/completion.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/completion.ts unijob-web/functions/tests/unit/completion.test.ts
git commit -m "feat(functions): add server completion rules and work history record [task:1]"
```

---

### Task 2: `handleConfirmCompletion` transaction

**Depends on Task 1.**

**Files:**
- Create: `unijob-web/functions/src/handlers/confirmCompletion.ts`
- Test: `unijob-web/functions/tests/emulator/confirmCompletion.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `parseCompletionInput`, `completionParties`, `nextCompletionStep`, `workHistoryIdFor`, `planWorkHistory`, `ConfirmCompletionResult`, `COMPLETION_MSG`.
- Produces: `handleConfirmCompletion(db: Firestore, uid: string, data: unknown): Promise<ConfirmCompletionResult>`

- [ ] **Step 1: Write the failing emulator test**

`unijob-web/functions/tests/emulator/confirmCompletion.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleConfirmCompletion } from '../../src/handlers/confirmCompletion.js';
import { COMPLETION_MSG } from '../../src/lib/completion.js';
import { connectEmulatorDb } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function inProgressJob(job: Record<string, unknown> = {}) {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  await db.doc(`jobs/${jobId}`).set({
    title: 'Nhập liệu', category: 'Gia sư', postedBy: poster, status: 'in-progress',
    assignedTo: [worker], applicants: [worker], payment: 150_000, paymentType: 'fixed', ...job,
  });
  return {
    poster, worker, jobId,
    jobRef: db.doc(`jobs/${jobId}`),
    completionRef: db.doc(`jobCompletions/${jobId}`),
    historyRef: db.doc(`workHistory/${jobId}_${worker}`),
  };
}
const historyCount = async (jobId: string) => (await db.collection('workHistory').where('jobId', '==', jobId).get()).size;
const confirmed = { status: 'confirmed', workerConfirmed: true, posterConfirmed: true };

describe('confirmCompletion handler (emulator)', () => {
  it('worker first creates a pending server record; the job stays in progress', async () => {
    const { worker, jobId, jobRef, completionRef, historyRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    const c = (await completionRef.get()).data();
    expect(c).toMatchObject({ jobId, workerConfirmed: true, posterConfirmed: false, status: 'pending', completedAt: null, source: 'server' });
    expect(c?.createdAt).toBeInstanceOf(Timestamp);
    expect(c?.updatedAt).toBeInstanceOf(Timestamp);
    expect((await jobRef.get()).get('status')).toBe('in-progress');
    expect((await historyRef.get()).exists).toBe(false);
  });

  it('poster first is failed-precondition and writes nothing', async () => {
    const { poster, jobId, completionRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, poster, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it('poster second: completion confirmed, job completed, one work history entry', async () => {
    const { poster, worker, jobId, jobRef, completionRef, historyRef } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    await expect(handleConfirmCompletion(db, poster, { jobId })).resolves.toEqual(confirmed);
    const c = (await completionRef.get()).data();
    expect(c).toMatchObject({ ...confirmed });
    expect(c?.completedAt).toBeInstanceOf(Timestamp);
    const j = (await jobRef.get()).data();
    expect(j?.status).toBe('completed');
    expect(j?.updatedAt).toBeInstanceOf(Timestamp);
    const h = (await historyRef.get()).data();
    expect(h).toMatchObject({ user1: poster, user2: worker, jobId, jobTitle: 'Nhập liệu', category: 'Gia sư', source: 'server' });
    expect(h?.completedAt).toBeInstanceOf(Timestamp);
  });

  it('worker second on an old-client doc (both false): poster records, then the worker completes the job', async () => {
    const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob();
    await completionRef.set({ jobId, workerConfirmed: false, posterConfirmed: false, status: 'pending', completedAt: null, createdAt: Timestamp.now() });
    await expect(handleConfirmCompletion(db, poster, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: false, posterConfirmed: true });
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual(confirmed);
    expect((await jobRef.get()).get('status')).toBe('completed');
    expect((await completionRef.get()).get('source')).toBeUndefined(); // legacy doc updated in place
    expect(await historyCount(jobId)).toBe(1);
  });

  it('an idempotent repeat writes nothing', async () => {
    const { worker, jobId, completionRef } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    const updatedAt = (await completionRef.get()).get('updatedAt') as Timestamp;
    await expect(handleConfirmCompletion(db, worker, { jobId })).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect(((await completionRef.get()).get('updatedAt') as Timestamp).isEqual(updatedAt)).toBe(true);
  });

  it('concurrent second confirmations: one completes the job, the other is alreadyCompleted, one work history', async () => {
    const { poster, worker, jobId } = await inProgressJob();
    await handleConfirmCompletion(db, worker, { jobId });
    const results = await Promise.allSettled([handleConfirmCompletion(db, poster, { jobId }), handleConfirmCompletion(db, poster, { jobId })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'failed-precondition', message: COMPLETION_MSG.alreadyCompleted } });
    expect(await historyCount(jobId)).toBe(1);
  });

  it('a stuck legacy doc (confirmed, job still in progress) is finished and keeps its completedAt', async () => {
    const { poster, jobId, jobRef, completionRef } = await inProgressJob();
    const completedAt = Timestamp.fromMillis(1_700_000_000_000);
    await completionRef.set({ jobId, workerConfirmed: true, posterConfirmed: true, status: 'confirmed', completedAt });
    await expect(handleConfirmCompletion(db, poster, { jobId })).resolves.toEqual(confirmed);
    expect((await jobRef.get()).get('status')).toBe('completed');
    expect(((await completionRef.get()).get('completedAt') as Timestamp).isEqual(completedAt)).toBe(true);
    expect(await historyCount(jobId)).toBe(1);
  });

  it('an existing server work history doc is kept, a forged one is replaced', async () => {
    const kept = await inProgressJob();
    const at = Timestamp.fromMillis(1_700_000_000_000);
    await kept.historyRef.set({ user1: kept.poster, user2: kept.worker, jobId: kept.jobId, jobTitle: 'Nhập liệu', category: 'Gia sư', completedAt: at, source: 'server' });
    await handleConfirmCompletion(db, kept.worker, { jobId: kept.jobId });
    await handleConfirmCompletion(db, kept.poster, { jobId: kept.jobId });
    expect(((await kept.historyRef.get()).get('completedAt') as Timestamp).isEqual(at)).toBe(true);

    const forged = await inProgressJob();
    await forged.historyRef.set({ user1: 'mallory', user2: forged.worker, jobId: forged.jobId, jobTitle: 'Giả' });
    await handleConfirmCompletion(db, forged.worker, { jobId: forged.jobId });
    await handleConfirmCompletion(db, forged.poster, { jobId: forged.jobId });
    expect((await forged.historyRef.get()).data()).toMatchObject({ user1: forged.poster, jobTitle: 'Nhập liệu', source: 'server' });
  });

  it('outsider and second assignee are permission-denied and nothing changes', async () => {
    const { worker, jobId, jobRef, completionRef } = await inProgressJob();
    await expect(handleConfirmCompletion(db, uid('mallory'), { jobId })).rejects.toMatchObject({ code: 'permission-denied' });
    const other = uid('worker2');
    await jobRef.update({ assignedTo: [worker, other] });
    await expect(handleConfirmCompletion(db, other, { jobId })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it.each([
    ['open', COMPLETION_MSG.notInProgress],
    ['cancelled', COMPLETION_MSG.notInProgress],
    ['completed', COMPLETION_MSG.alreadyCompleted],
  ])('a %s job is failed-precondition and nothing changes', async (status, message) => {
    const { worker, jobId, completionRef } = await inProgressJob({ status });
    await expect(handleConfirmCompletion(db, worker, { jobId })).rejects.toMatchObject({ code: 'failed-precondition', message });
    expect((await completionRef.get()).exists).toBe(false);
  });

  it('a missing job is not-found, a bad id invalid-argument', async () => {
    await expect(handleConfirmCompletion(db, uid('w'), { jobId: uid('nojob') })).rejects.toMatchObject({ code: 'not-found' });
    await expect(handleConfirmCompletion(db, uid('w'), { jobId: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/confirmCompletion.emulator.test.ts"`
Expected: FAIL, cannot resolve `src/handlers/confirmCompletion.js`.

- [ ] **Step 3: Implement `handleConfirmCompletion` in `src/handlers/confirmCompletion.ts`**

`parseCompletionInput` runs outside the transaction. Inside one `db.runTransaction`: read the job, then `completionParties` (throws before any other read), then read `jobCompletions/{jobId}` and `workHistory/{workHistoryIdFor(jobId, workerId)}` in parallel. All reads happen before writes. Then apply `nextCompletionStep`:
- `write: false`: return `step.state`.
- `create`: `tx.set` with the Decision 3 record.
- Otherwise: `tx.update` with own flag, `jobId` and `updatedAt`, plus, when confirmed, `status: 'confirmed'` and `completedAt` (keep an existing `Timestamp` instance, else `FieldValue.serverTimestamp()`).
- When confirmed: `tx.update(jobRef, { status: 'completed', updatedAt })`. Also `tx.set(historyRef, { ...planWorkHistory(...), completedAt })` unless the history doc exists with `source === 'server'`. Log `logger.warn` when it replaces a non-server doc.

Return `step.state`. Add a doc comment pointing to Decision 3 (stuck legacy docs are finished here).

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/confirmCompletion.emulator.test.ts"`
Expected: PASS (13 tests).

Run: `cd unijob-web/functions && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/handlers/confirmCompletion.ts unijob-web/functions/tests/emulator/confirmCompletion.emulator.test.ts
git commit -m "feat(functions): confirm job completion server-side in one transaction [task:2]"
```

---

### Task 3: `confirmCompletion` callable

**Depends on Task 2. Independent of Task 4.**

**Files:**
- Create: `unijob-web/functions/src/callables/confirmCompletion.ts`
- Test: `unijob-web/functions/tests/unit/callables/confirmCompletion.test.ts`
- Test: `unijob-web/functions/tests/emulator/confirmCompletion.emulator.test.ts` (extend)

**Interfaces:**
- Consumes: `handleConfirmCompletion` (Task 2), `ConfirmCompletionResult` (Task 1), `requireVerifiedMember`, `REGION`, `db` (`src/admin.ts`).
- Produces: `confirmCompletion` (v2 `onCall`, region `REGION`), re-exporting `type ConfirmCompletionResult`. 5b calls it with `{ jobId }`.

- [ ] **Step 1: Write the failing unit test**

`unijob-web/functions/tests/unit/callables/confirmCompletion.test.ts`: copy the structure of `tests/unit/callables/disputePayment.test.ts`. Mock `../../../src/admin.js` (`{ db: { fake: 'db' } }`) and `../../../src/handlers/confirmCompletion.js` (`handleConfirmCompletion: vi.fn(async () => ({ status: 'pending', workerConfirmed: true, posterConfirmed: false }))`). The request data is `{ jobId: 'j1' }`. Tests:
- `is a callable in asia-southeast1`: `__endpoint.region` equals `['asia-southeast1']`, `callableTrigger` defined.
- `passes the Admin db, the verified uid and the data`: resolves to the mocked state, `handleConfirmCompletion` called with `({ fake: 'db' }, 'alice', { jobId: 'j1' })`.
- `rejects %s before touching data`: signed out → `unauthenticated`; unverified email, non-HCMUT email, anonymous → `permission-denied`; the handler is not called.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/callables/confirmCompletion.test.ts`
Expected: FAIL, cannot resolve `src/callables/confirmCompletion.js`.

- [ ] **Step 3: Implement**

`onCall({ region: REGION }, (request): Promise<ConfirmCompletionResult> => handleConfirmCompletion(db, requireVerifiedMember(request), request.data))`, the same as `callables/disputePayment.ts`.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/callables/confirmCompletion.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Extend the emulator test through the real wrapper**

In `confirmCompletion.emulator.test.ts`:
- Add `let confirmCompletion: typeof import('../../src/callables/confirmCompletion.js').confirmCompletion;` and import it dynamically in `beforeAll` after `connectEmulatorDb()`.
- Add the `verifiedRequest(id, data, token = {})` helper from `tests/emulator/disputes.emulator.test.ts`.
- Add:

```ts
describe('confirmCompletion callable (emulator)', () => {
  it('worker then poster through the callable completes the job', async () => {
    const { poster, worker, jobId, jobRef } = await inProgressJob();
    await expect(confirmCompletion.run(verifiedRequest(worker, { jobId }))).resolves.toMatchObject({ status: 'pending' });
    await expect(confirmCompletion.run(verifiedRequest(poster, { jobId }))).resolves.toEqual(confirmed);
    expect((await jobRef.get()).get('status')).toBe('completed');
  });

  it.each([
    ['unverified email', { email_verified: false }],
    ['non-HCMUT email', { email: 'worker@gmail.com' }],
    ['anonymous user', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s: the assigned worker is refused with permission-denied and nothing is written', async (_l, token) => {
    const { worker, jobId, completionRef } = await inProgressJob();
    await expect(confirmCompletion.run(verifiedRequest(worker, { jobId }, token))).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await completionRef.get()).exists).toBe(false);
  });
});
```

- [ ] **Step 5: Run the emulator test**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/confirmCompletion.emulator.test.ts"`
Expected: PASS (17 tests).

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add unijob-web/functions/src/callables/confirmCompletion.ts unijob-web/functions/tests/unit/callables/confirmCompletion.test.ts unijob-web/functions/tests/emulator/confirmCompletion.emulator.test.ts
git commit -m "feat(functions): add confirmCompletion callable for verified members [task:3]"
```

---

### Task 4: End-to-end flow with the existing triggers

**Depends on Task 2. Independent of Task 3.** This task adds tests only; it pins the existing triggers' behaviour on server writes. If a test fails, fix `handlers/confirmCompletion.ts` (never the trigger handlers, per the Global Constraints), and report it.

**Files:**
- Test: `unijob-web/functions/tests/emulator/completionFlow.emulator.test.ts`

**Interfaces:**
- Consumes: `handleConfirmCompletion` (Task 2); existing `handleCompletionWritten` (`handlers/completions.ts`), `handleJobUpdated` (`handlers/jobs.ts`), `handleEscrow` (`handlers/payments.ts`), `notificationsFor`.

- [ ] **Step 1: Write the test**

Set up like Task 2's file. The `inProgressJob` helper also seeds `applications/{jobId}_{worker}` `{ jobId, applicantId: worker, status: 'accepted' }`. With `held: true` it also seeds the server payment exactly as `heldJob` in `tests/emulator/disputes.emulator.test.ts` does (`payments/{jobId}_{worker}`, `status: 'held'`, `source: 'server'`, amounts 150 000 / 4 500 / 145 500) and sets `paymentStatus: 'held'` on the job. Take snapshots with `(await ref.get()).data()` before and after each call, as the triggers would see them. Tests:

```ts
it('worker confirms, poster confirms: completion_requested once, job_completed to both, escrow released, one work history', async () => {
  const { poster, worker, jobId, jobRef, completionRef } = await inProgressJob({ held: true });
  await handleConfirmCompletion(db, worker, { jobId });
  await expect(handleCompletionWritten(db, jobId, undefined, (await completionRef.get()).data())).resolves.toBe(true);
  const cBefore = (await completionRef.get()).data();
  const jobBefore = (await jobRef.get()).data();
  await handleConfirmCompletion(db, poster, { jobId });
  await expect(handleCompletionWritten(db, jobId, cBefore, (await completionRef.get()).data())).resolves.toBe(false);
  const jobAfter = (await jobRef.get()).data();
  await handleJobUpdated(db, jobId, jobBefore, jobAfter);
  await expect(handleEscrow(db, jobId, jobBefore, jobAfter)).resolves.toBe('released');
  expect((await db.doc(`payments/${jobId}_${worker}`).get()).get('status')).toBe('released');
  expect((await jobRef.get()).get('paymentStatus')).toBe('released');
  expect((await notificationsFor(db, poster)).map((d) => d.id).sort()).toEqual([`completion_requested_${jobId}`, `job_completed_${jobId}_${poster}`].sort());
  expect((await notificationsFor(db, worker)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${worker}`]);
});

it('worker confirming last (poster first on an old-client doc) sends no completion_requested and still releases escrow', async () => {
  // seed jobCompletions/{jobId} { jobId, workerConfirmed: false, posterConfirmed: false, status: 'pending', completedAt: null },
  // poster confirms, then capture before-data; worker confirms; handleCompletionWritten(before, after) -> false;
  // handleEscrow(jobBefore, jobAfter) -> 'released'; poster has no completion_requested notification.
});

it('a volunteer job completes without a payment and without an error', async () => {
  // inProgressJob({ paymentType: 'volunteer', payment: 0 }); worker + poster confirm;
  // handleEscrow(jobBefore, jobAfter) resolves 'skipped'; payments/{jobId}_{worker} does not exist; job is completed.
});
```

Write the bodies of the second and third tests from their comments, in the style of the first.

- [ ] **Step 2: Run the emulator test**

Run: `cd unijob-web && npx firebase emulators:exec --config <EMULATOR_CONFIG> --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/completionFlow.emulator.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 3: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 4: Commit**

```bash
git add unijob-web/functions/tests/emulator/completionFlow.emulator.test.ts
git commit -m "test(functions): pin the server completion flow through the existing triggers [task:4]"
```

---

### Task 5: Export `confirmCompletion`, document completion and the deploy order

**Depends on Tasks 3 and 4.**

**Files:**
- Modify: `unijob-web/functions/src/index.ts`
- Modify: `unijob-web/functions/README.md`
- Modify: `docs/backlog/security-holes.md`
- Test: `unijob-web/functions/tests/unit/index.test.ts`

**Interfaces:**
- Produces: the deployable set `confirmCompletion, disputePayment, expireJobs, onApplicationCreated, onApplicationUpdated, onJobCompletionWritten, onJobEscrow, onJobUpdated, ping, sendJobInvite`.

- [ ] **Step 1: Write the failing test**

In `unijob-web/functions/tests/unit/index.test.ts`, add `'confirmCompletion'` to the expected key list.

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/index.test.ts`
Expected: FAIL, `confirmCompletion` missing.

- [ ] **Step 2: Implement and document**

- `src/index.ts`: `export { confirmCompletion } from './callables/confirmCompletion.js';`
- `README.md`:
  - In the `src/lib/` bullet, add "the completion rules in `completion.ts`".
  - Add a section `## Completion (slice 5)` after the escrow section, with a one-row table. `confirmCompletion`: callable `{ jobId }` → `{ status, workerConfirmed, posterConfirmed }`, gated by `requireVerifiedMember`. The worker confirms first (creates `jobCompletions/{jobId}`), the poster second, or the reverse on a legacy doc. Once both have confirmed: completion `confirmed`, job `completed`, `workHistory/{jobId}_{workerId}`.
  - Below the table, add: "One transaction. A repeat by the same side writes nothing, and a completed job is refused. The existing triggers do the rest: `onJobCompletionWritten` (`completion_requested`), `onJobUpdated` (`job_completed`), `onJobEscrow` (releases held escrow). A legacy completion stuck at `confirmed` while its job is still `in-progress` is finished by the next call from either side. A non-server `workHistory` doc at the deterministic id is replaced."
  - In "Deploying functions", add: "Slice 5 order, one window: `--only functions` (5a) FIRST, then `--only hosting,firestore:rules` from the 5b branch together. Deploying the 5b rules before these functions breaks completion for everyone."
- `docs/backlog/security-holes.md`: delete the "**Second-confirmer completion**" bullet. Leave the pinned KNOWN HOLE list and the `workHistory.create` bullet alone (5b closes them in the rules).

- [ ] **Step 3: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck && npm run build`
Expected: PASS, `lib/` emitted.

- [ ] **Step 4: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS. (`--full` with the coverage gate runs in uj-build's final CI. `lib/completion.ts`, `handlers/confirmCompletion.ts` and `callables/confirmCompletion.ts` must each be at 70% or more.)

- [ ] **Step 5: Commit**

```bash
git add unijob-web/functions/src/index.ts unijob-web/functions/README.md unijob-web/functions/tests/unit/index.test.ts docs/backlog/security-holes.md
git commit -m "docs(functions): export confirmCompletion and document server completion [task:5]"
```

---

## Self-review notes

- Design 5a.1 (callable, transaction, worker first, poster-on-missing denied, idempotent repeat, finalize with completion/job/workHistory, legacy doc updated): Tasks 1 and 2. 5a.1 trigger flow incl. escrow release: Task 4. 5a.2 test list (worker first, poster first denied, poster second, worker second, idempotent, outsider, non-verified, not in progress, completed, workHistory not duplicated, legacy doc): Tasks 2 and 3. 5a.3 (index, README, backlog): Task 5.
- Names are consistent across tasks: `COMPLETION_MSG`, `parseCompletionInput`, `completionParties`, `nextCompletionStep`, `CompletionStep`, `CompletionState`, `ConfirmCompletionResult`, `workHistoryIdFor`, `planWorkHistory`, `WorkHistoryFields`, `handleConfirmCompletion`, `confirmCompletion`.
- 5b's `src/lib/callableError.ts` allowlist needs the five `COMPLETION_MSG` strings plus `MSG_JOB_NOT_FOUND`, `MSG_NOT_MEMBER`, `MSG_NOT_VERIFIED` and `MSG_UNAUTHENTICATED`.
- The PR body must state: deploy needs Blaze; the 5a functions go first, then 5b hosting + rules in one window; no App Check yet.
