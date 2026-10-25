---
status: approved
approved: 2026-10-17 by HieNguyen08 in chat ("giờ làm bước tiếp theo", "tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/server-notification-triggers
base: main
slice: 3a (spec section 3, slice 3 "server notifications", server half)
stacked-next: docs/plans/2026-10-17-server-notifications-client.md
---

# Server notification triggers (slice 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notification the web client sends today to another user is also produced server-side by Cloud Functions (Firestore triggers, one scheduled function, one callable) using the existing idempotent `writeNotification`. This PR is additive only: no client, no rules change.

**Architecture:** Each event gets a pure handler in `functions/src/handlers/*.ts` that takes `(db, ids, data)` and never imports `src/admin.ts`. Thin wrappers in `functions/src/triggers/*.ts`, `functions/src/scheduled/*.ts` and `functions/src/callables/*.ts` bind a handler to a v2 trigger (`database: DATABASE_ID`, `region: REGION`) and pass the Admin `db`. Unit tests call handlers with a fake db and mocked `writeNotification`, and call wrappers through `.run(fakeEvent)` with `src/admin.js` mocked. Emulator tests write the real source documents with the Admin SDK, pass the stored data to the handler (twice, to simulate redelivery) and assert exactly one notification document.

**Tech Stack:** firebase-functions 7.4.0 (v2 `firebase-functions/v2/firestore`, `/scheduler`, `/https`), firebase-admin 14.5.0, TypeScript, Vitest 5 (projects `unit` and `emulator`), Firestore emulator (project `demo-unijob`, database `kirigitejkf8095h`).

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 3; decisions table in section 2; error handling in section 4).

## Global Constraints

- Region `asia-southeast1` (`REGION`), database `kirigitejkf8095h` (`DATABASE_ID`). Every Firestore trigger passes `database: DATABASE_ID` and `region: REGION`. Never hard-code either string in `src/`.
- Emulator project id is always `demo-unijob`. Emulator tests must go through `assertEmulatorEnv` + `assertAppProject` (`functions/tests/support/emulator.ts`).
- Notification doc id is `${type}_${sourceId}` (from `writeNotification`). Triggers log and never throw on duplicate events (spec section 4).
- UI copy is Vietnamese. Notification messages must be byte-identical to today's client texts (listed in Task 1). The only change: titles and names are clipped (Task 1) so a hostile job title cannot blow up a notification document.
- New `functions/src/**` files need at least 70% line coverage (`ci-local --full` coverage gate, counts unit and emulator projects together).
- Tests live in `unijob-web/functions/tests/unit/**` and `unijob-web/functions/tests/emulator/**`, never next to source.
- `firebase-functions-test` is not used (see `functions/README.md`): call v2 functions via `.run(...)`.
- Conventional Commits, commit message ends with `[task:N]`, no `Co-Authored-By` trailer. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact working tree. Tasks with emulator tests also run `node scripts/ci-local.mjs --full` (needs Java 11 or later) before committing.
- Do not touch `unijob-web/src/**`, `unijob-web/firestore.rules` or `unijob-web/tests/**` in this PR (that is plan 3b).

## Inventory: client notifications to other users today

| # | Where today | Type | Recipient | Exact message | Server replacement (this plan) | sourceId |
|---|---|---|---|---|---|---|
| 1 | `job.service.ts` `applyForJob` | `new_application` | job poster (if not the applicant) | `${applicantName} đã ứng tuyển "${job.title}"` (extras jobId, jobTitle, fromName) | `onApplicationCreated` (Task 2) | `appId` (applications are never deleted, rules `delete: if false`, and ids are `{jobId}_{uid}`, so one create per id) |
| 2 | `job.service.ts` `runDecisionSideEffects` | `application_accepted` | applicant | `🎉 Đơn ứng tuyển "${jobTitle}" đã được chấp nhận!` | `onApplicationUpdated` pending to accepted (Task 2) | `appId` (the rules allow one decision only: `pending` to `accepted`/`rejected`) |
| 3 | same | `application_rejected` | applicant | `Đơn ứng tuyển "${jobTitle}" không được chấp nhận` | `onApplicationUpdated` pending to rejected (Task 2) | `appId` |
| 4 | `rating.service.ts` `confirmCompletion` (worker, poster not yet confirmed) | `completion_requested` | poster | `📋 Người làm đã báo cáo hoàn thành "${job.title}". Vui lòng kiểm tra và xác nhận.` | `onJobCompletionWritten` (Task 4) | `jobId` (one request per job; see Decisions) |
| 5 | `rating.service.ts` `confirmCompletion` (both confirmed) | `job_completed` | worker `assignedTo[0]` | `🎉 Công việc "${job.title}" đã hoàn thành! Hãy để lại đánh giá.` | `onJobUpdated` status to `completed` (Task 3) | `${jobId}_${workerUid}` |
| 6 | same | `job_completed` | poster | `✅ Công việc "${job.title}" đã được xác nhận hoàn thành.` | `onJobUpdated` status to `completed` (Task 3) | `${jobId}_${posterUid}` |
| 7 | `cancel.service.ts` `posterCancelJob` | `job_cancelled` | each assigned worker | `Công việc "${cancelledJob.title}" đã bị người đăng hủy.` | `onJobUpdated` status to `cancelled` (Task 3) | `${jobId}_${workerUid}` |
| 8 | `cancel.service.ts` `workerCancelJob` | `job_cancelled` | poster | `Người nhận việc đã hủy "${job.title}". Công việc đang tìm người mới.` | **Not in this slice** (see Decisions) | n/a |
| 9 | `cleanup.service.ts` `cleanupExpiredJobs` (run by the poster on login) | `deadline_expired` | poster (self today) | `⏰ Công việc "${job.title}" đã hết hạn và được đóng tự động.` | scheduled `expireJobs` (Task 5) | `jobId` |
| 10 | `pages/CreateJob.tsx` `handleSendInvite` | `job_invite` | invited worker | `${userProfile?.displayName} mời bạn ứng tuyển "${smartMatchModal.jobTitle}"` (extras jobId, jobTitle, fromName) | callable `sendJobInvite` (Task 6) | `${jobId}_${workerUid}` |

`payment.service.ts` sends no notifications (checked). No flow remains where a client legitimately notifies only itself: #9 is a self-notification today but moves to the scheduler, and the poster's own `job_completed` (#6) moves to the job trigger. Plan 3b therefore denies `notifications.create` for every client.

## Decisions

1. **No feature flag; ship 3a and 3b as one deploy window.** Between deploying these functions and deploying 3b's hosting + rules, the old client still writes its own notification (random id) and the server writes `{type}_{sourceId}`, so a user can see a duplicate bell entry for events in that window. The duplicates are cosmetic (no money, no state). A flag would add a runtime config param, a second code path in every handler, tests for both states, and a later cleanup PR, for a window of minutes. Deploy order (owner, Blaze plan): `firestore:indexes` (Task 5 index), then `functions` (3a), then immediately `hosting` + `firestore:rules` (3b). Never deploy 3b's rules before 3a's functions: notifications would stop entirely.
2. **`job_completed` fires on the job's status transition to `completed`, not on the `jobCompletions` doc.** The job status is the truth that unlocks rating. Today, when the worker confirms last, the client's `updateJob(status: 'completed')` is denied by the rules, so a completion-doc trigger would announce "đã hoàn thành! Hãy để lại đánh giá" for a job whose rating is still locked. Slice 5's server completion sets the job status, so this trigger keeps working unchanged. Same type for two recipients means the sourceId must include the uid (`${jobId}_${uid}`), otherwise the second write would be dropped as a duplicate.
3. **`completion_requested` uses sourceId `jobId`.** `jobCompletions` is writable by any signed-in user until slice 5 (KNOWN HOLE "outsiders cannot confirm a completion"). Keying by job (not by completion doc) caps forged-doc spam at one notification per job, and the handler also requires the job to be `in-progress` with an assigned worker. There is no "reject completion" flow today, so a second legitimate request per job never happens.
4. **Worker cancellation (#8) is deferred to slice 6.** `workerCancelJob` is denied by the rules today before it reaches the notification (backlog "Worker cancel"), and the rules allow no transition the server could observe (`in-progress` to `open` is forbidden, the worker cannot write the application). Slice 6's callable `cancelJob` writes this notification itself. 3b removes the dead client call.
5. **Expiry: preconditioned per-job updates, then notify.** The scheduler queries `status == 'open' && deadline < now` ordered by `deadline`, pages with `startAfter`, and updates each job with `{ lastUpdateTime: snap.updateTime }` so a job the poster edited (for example extended its deadline) after the query is skipped instead of being force-cancelled. A whole-page `WriteBatch` would let one concurrent edit fail all 200 jobs. A notification is written only for jobs that were actually cancelled, so no user gets a false "đã hết hạn". If the notification write fails right after the update, it is logged (rare double-failure; accepted). This needs a new composite index `jobs(status ASC, deadline ASC)`.
6. **`job_invite` is a callable, not a trigger.** No document write represents an invite. `sendJobInvite({ jobId, workerId })` checks the caller is the job's poster, the job is `open`, the worker exists and is not the caller. `fromName` is `job.postedByName` (which is `'Ẩn danh'` for anonymous jobs), not the caller's display name: today's client leaks the poster's real name on anonymous jobs. One invite per worker per job (sourceId `${jobId}_${workerId}`); a repeat returns `{ sent: false }`. Per-poster rate limiting across many jobs is out of scope (noted in the PR body). `requireVerifiedMember` is not required here: the backlog asks for it before money/reputation callables.
7. **Emulator tests call handlers directly, not through the Functions emulator.** `npm run test:functions` starts only the Firestore emulator; starting the Functions emulator would need a build plus trigger-delivery waits (slow, flaky). The trigger wiring (path, database, region, event unpacking) is covered by unit tests on `.run()` and `__endpoint`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `unijob-web/functions/src/lib/messages.ts` (create) | Exact Vietnamese message builders + `clip` | 1 |
| `unijob-web/functions/src/lib/jobs.ts` (create) | `isDocId`, `toJobInfo`, `readJob`, `FALLBACK_JOB_TITLE` | 1 |
| `unijob-web/functions/tests/support/fakeDb.ts` (create) | Minimal fake Firestore for unit tests (`collection().doc().get()`) | 1 |
| `unijob-web/functions/tests/support/emulatorDb.ts` (create) | Guarded Admin db for emulator tests + `notificationsFor` | 1 |
| `unijob-web/functions/src/handlers/applications.ts` (create) | `handleApplicationCreated`, `handleApplicationUpdated` | 2 |
| `unijob-web/functions/src/triggers/applications.ts` (create) | `onApplicationCreated`, `onApplicationUpdated` | 2 |
| `unijob-web/functions/src/handlers/jobs.ts` (create) | `handleJobUpdated` (cancelled, completed) | 3 |
| `unijob-web/functions/src/triggers/jobs.ts` (create) | `onJobUpdated` | 3 |
| `unijob-web/functions/src/handlers/completions.ts` (create) | `handleCompletionWritten` | 4 |
| `unijob-web/functions/src/triggers/completions.ts` (create) | `onJobCompletionWritten` | 4 |
| `unijob-web/functions/src/handlers/expireJobs.ts` (create) | `expireOverdueJobs` | 5 |
| `unijob-web/functions/src/scheduled/expireJobs.ts` (create) | `expireJobs` (onSchedule) | 5 |
| `unijob-web/firestore.indexes.json` (modify) | index `jobs(status, deadline)` | 5 |
| `unijob-web/functions/src/handlers/invites.ts` (create) | `handleSendJobInvite`, `INVITE_MSG`, `SendJobInviteResult` | 6 |
| `unijob-web/functions/src/callables/sendJobInvite.ts` (create) | `sendJobInvite` (onCall) | 6 |
| `unijob-web/functions/src/index.ts` (modify) | export every function | 7 |
| `unijob-web/functions/README.md` (modify) | function list + deploy order | 7 |

## Parallelism

- **Task 1** first (shared helpers).
- **Tasks 2, 3, 4, 5, 6** are independent of each other (disjoint files; each only consumes Task 1). They can run as parallel workers in separate worktrees cut from the branch after Task 1's commit. None of them touches `src/index.ts`.
- **Task 7** last (exports every function from `src/index.ts`; needs 2 to 6 merged).

## Review Focus

1. A job title that is very long, contains quotes or emoji: the message must clip the title (max 120 characters, ends with `…`) and the write must still succeed (tests in Task 1 and Task 2).
2. The same event delivered twice, or two deliveries at once: exactly one notification document, the second call returns `false` (emulator tests in Tasks 2 to 6).
3. A job whose `assignedTo` contains the poster's own uid or a non-string: the poster is never sent a "worker" notification, junk entries are ignored (Task 1 `toJobInfo`, Task 3).
4. Legacy or malformed source documents (missing `jobId`, `jobId` with a `/`, missing `applicantName`, `deadline` stored as a string): the handler logs and returns without throwing, and the scheduler never cancels a job without a Timestamp deadline (Tasks 1, 2, 5).
5. A job edited by its poster between the scheduler's query and its update: the job stays open and no "đã hết hạn" notification is sent (Task 5 precondition test).

---

### Task 1: Shared message builders, job reader and test support

**Files:**
- Create: `unijob-web/functions/src/lib/messages.ts`
- Create: `unijob-web/functions/src/lib/jobs.ts`
- Create: `unijob-web/functions/tests/support/fakeDb.ts`
- Create: `unijob-web/functions/tests/support/emulatorDb.ts`
- Test: `unijob-web/functions/tests/unit/messages.test.ts`
- Test: `unijob-web/functions/tests/unit/jobs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `clip(text: string, max: number): string`
  - `messages: { newApplication(applicantName: string, title: string): string; applicationAccepted(title: string): string; applicationRejected(title: string): string; completionRequested(title: string): string; jobCompletedWorker(title: string): string; jobCompletedPoster(title: string): string; jobCancelledByPoster(title: string): string; deadlineExpired(title: string): string; jobInvite(fromName: string, title: string): string }`
  - `FALLBACK_JOB_TITLE = 'công việc'`, `FALLBACK_APPLICANT_NAME = 'Một ứng viên'`, `FALLBACK_POSTER_NAME = 'Người đăng việc'`
  - `interface JobInfo { id: string; title: string; postedBy: string; postedByName: string; assignedTo: string[]; status: string }`
  - `isDocId(id: unknown): id is string`
  - `toJobInfo(id: string, data: Record<string, unknown> | undefined): JobInfo | null`
  - `readJob(db: Firestore, jobId: unknown): Promise<JobInfo | null>`
  - tests: `fakeDb(docs?: Record<string, Record<string, unknown>>): Firestore` (keys like `'jobs/j1'`), `connectEmulatorDb(): Promise<{ app: App; db: Firestore }>`, `notificationsFor(db: Firestore, userId: string): Promise<QueryDocumentSnapshot[]>`

- [ ] **Step 1: Write the failing tests**

`unijob-web/functions/tests/unit/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clip, messages } from '../../src/lib/messages.js';

describe('clip', () => {
  it('keeps short text unchanged', () => {
    expect(clip('Nhập liệu', 120)).toBe('Nhập liệu');
  });
  it('clips by characters (not UTF-16 units) and ends with an ellipsis', () => {
    const long = '😀'.repeat(200);
    const out = clip(long, 120);
    expect(Array.from(out)).toHaveLength(120);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('messages (byte-identical to the web client texts)', () => {
  it.each([
    [messages.newApplication('Carol', 'Nhập liệu'), 'Carol đã ứng tuyển "Nhập liệu"'],
    [messages.applicationAccepted('Nhập liệu'), '🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!'],
    [messages.applicationRejected('Nhập liệu'), 'Đơn ứng tuyển "Nhập liệu" không được chấp nhận'],
    [messages.completionRequested('Nhập liệu'), '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.'],
    [messages.jobCompletedWorker('Nhập liệu'), '🎉 Công việc "Nhập liệu" đã hoàn thành! Hãy để lại đánh giá.'],
    [messages.jobCompletedPoster('Nhập liệu'), '✅ Công việc "Nhập liệu" đã được xác nhận hoàn thành.'],
    [messages.jobCancelledByPoster('Nhập liệu'), 'Công việc "Nhập liệu" đã bị người đăng hủy.'],
    [messages.deadlineExpired('Nhập liệu'), '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.'],
    [messages.jobInvite('Alice', 'Nhập liệu'), 'Alice mời bạn ứng tuyển "Nhập liệu"'],
  ])('%s', (actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('clips a hostile title to 120 characters and a name to 100', () => {
    const msg = messages.newApplication('n'.repeat(500), 't'.repeat(5000));
    expect(msg).toBe(`${'n'.repeat(99)}… đã ứng tuyển "${'t'.repeat(119)}…"`);
  });
});
```

`unijob-web/functions/tests/unit/jobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FALLBACK_JOB_TITLE, isDocId, readJob, toJobInfo } from '../../src/lib/jobs.js';
import { fakeDb } from '../support/fakeDb.js';

describe('isDocId', () => {
  it.each(['j1', 'job_abc', 'Nhập'])('accepts %s', (id) => expect(isDocId(id)).toBe(true));
  it.each([undefined, null, 42, '', 'a/b', '.', '..', '__x__', 'x'.repeat(701)])('rejects %s', (id) => expect(isDocId(id)).toBe(false));
});

describe('toJobInfo', () => {
  it('normalises fields and drops junk assignees', () => {
    expect(
      toJobInfo('j1', { title: 'T', postedBy: 'p', postedByName: 'Ẩn danh', assignedTo: ['w', 3, '', null], status: 'open' }),
    ).toEqual({ id: 'j1', title: 'T', postedBy: 'p', postedByName: 'Ẩn danh', assignedTo: ['w'], status: 'open' });
  });
  it('falls back to "công việc" for a missing or blank title', () => {
    expect(toJobInfo('j1', { title: '   ' })?.title).toBe(FALLBACK_JOB_TITLE);
    expect(toJobInfo('j1', {})?.title).toBe(FALLBACK_JOB_TITLE);
  });
  it('returns empty strings and [] for missing fields, null for missing data', () => {
    expect(toJobInfo('j1', {})).toEqual({ id: 'j1', title: FALLBACK_JOB_TITLE, postedBy: '', postedByName: '', assignedTo: [], status: '' });
    expect(toJobInfo('j1', undefined)).toBeNull();
  });
});

describe('readJob', () => {
  it('reads jobs/{id}', async () => {
    const db = fakeDb({ 'jobs/j1': { title: 'T', postedBy: 'p', status: 'open' } });
    await expect(readJob(db, 'j1')).resolves.toMatchObject({ id: 'j1', title: 'T', postedBy: 'p' });
  });
  it('is null for a missing job or an invalid id (no read)', async () => {
    const db = fakeDb();
    await expect(readJob(db, 'nope')).resolves.toBeNull();
    await expect(readJob(db, 'a/b')).resolves.toBeNull();
    await expect(readJob(db, undefined)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/messages.test.ts tests/unit/jobs.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/messages.js` / `../../src/lib/jobs.js` / `../support/fakeDb.js`.

- [ ] **Step 3: Implement**

`unijob-web/functions/src/lib/messages.ts`:

```ts
/**
 * Notification texts. Keep byte-identical to the texts the web client sent before slice 3
 * (job.service.ts, rating.service.ts, cancel.service.ts, cleanup.service.ts, CreateJob.tsx).
 */
const MAX_TITLE = 120;
const MAX_NAME = 100;

/** At most `max` characters (code points, so emoji are never split); clipped text ends with '…'. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

const t = (title: string) => clip(title, MAX_TITLE);
const n = (name: string) => clip(name, MAX_NAME);

export const messages = {
  newApplication: (applicantName: string, title: string) => `${n(applicantName)} đã ứng tuyển "${t(title)}"`,
  applicationAccepted: (title: string) => `🎉 Đơn ứng tuyển "${t(title)}" đã được chấp nhận!`,
  applicationRejected: (title: string) => `Đơn ứng tuyển "${t(title)}" không được chấp nhận`,
  completionRequested: (title: string) =>
    `📋 Người làm đã báo cáo hoàn thành "${t(title)}". Vui lòng kiểm tra và xác nhận.`,
  jobCompletedWorker: (title: string) => `🎉 Công việc "${t(title)}" đã hoàn thành! Hãy để lại đánh giá.`,
  jobCompletedPoster: (title: string) => `✅ Công việc "${t(title)}" đã được xác nhận hoàn thành.`,
  jobCancelledByPoster: (title: string) => `Công việc "${t(title)}" đã bị người đăng hủy.`,
  deadlineExpired: (title: string) => `⏰ Công việc "${t(title)}" đã hết hạn và được đóng tự động.`,
  jobInvite: (fromName: string, title: string) => `${n(fromName)} mời bạn ứng tuyển "${t(title)}"`,
} as const;
```

`unijob-web/functions/src/lib/jobs.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';

export const FALLBACK_JOB_TITLE = 'công việc';
export const FALLBACK_APPLICANT_NAME = 'Một ứng viên';
export const FALLBACK_POSTER_NAME = 'Người đăng việc';

/** The fields of jobs/{jobId} the notification handlers need, normalised. */
export interface JobInfo {
  id: string;
  title: string;
  postedBy: string;
  postedByName: string;
  assignedTo: string[];
  status: string;
}

const MAX_ID_BYTES = 700; // leaves room for `${type}_${a}_${b}` under Firestore's 1500-byte id limit

/** A string usable as one Firestore document id segment. */
export function isDocId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    !id.includes('/') &&
    id !== '.' &&
    id !== '..' &&
    !/^__.*__$/.test(id) &&
    Buffer.byteLength(id, 'utf8') <= MAX_ID_BYTES
  );
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function toJobInfo(id: string, data: Record<string, unknown> | undefined): JobInfo | null {
  if (!data) return null;
  const assignedTo = Array.isArray(data.assignedTo)
    ? data.assignedTo.filter((uid): uid is string => typeof uid === 'string' && uid !== '')
    : [];
  return {
    id,
    title: str(data.title).trim() ? str(data.title) : FALLBACK_JOB_TITLE,
    postedBy: str(data.postedBy),
    postedByName: str(data.postedByName),
    assignedTo,
    status: str(data.status),
  };
}

/** jobs/{jobId}, or null if the id is unusable or the job does not exist. */
export async function readJob(db: Firestore, jobId: unknown): Promise<JobInfo | null> {
  if (!isDocId(jobId)) return null;
  const snap = await db.collection('jobs').doc(jobId).get();
  return snap.exists ? toJobInfo(jobId, snap.data()) : null;
}
```

`unijob-web/functions/tests/support/fakeDb.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';

/** Read-only fake: `collection(c).doc(id).get()` over a map keyed `${c}/${id}`. */
export function fakeDb(docs: Record<string, Record<string, unknown>> = {}): Firestore {
  const get = (path: string, id: string) =>
    Promise.resolve({ id, exists: path in docs, data: () => docs[path] });
  return {
    collection: (c: string) => ({
      doc: (id: string) => ({ id, path: `${c}/${id}`, get: () => get(`${c}/${id}`, id) }),
    }),
  } as unknown as Firestore;
}
```

`unijob-web/functions/tests/support/emulatorDb.ts`:

```ts
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { assertAppProject, assertEmulatorEnv } from './emulator.js';

/** Admin db on the local emulator, only after the guards pass. Import src/admin.js nowhere else in emulator tests. */
export async function connectEmulatorDb(): Promise<{ app: App; db: Firestore }> {
  assertEmulatorEnv();
  if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { app, db } = await import('../../src/admin.js');
  assertAppProject(app);
  return { app, db };
}

export async function notificationsFor(db: Firestore, userId: string): Promise<QueryDocumentSnapshot[]> {
  return (await db.collection('notifications').where('userId', '==', userId).get()).docs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/messages.test.ts tests/unit/jobs.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick`
Expected: all gates PASS (functions-typecheck and functions-tests run, others may be skipped).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/lib/messages.ts unijob-web/functions/src/lib/jobs.ts unijob-web/functions/tests/support/fakeDb.ts unijob-web/functions/tests/support/emulatorDb.ts unijob-web/functions/tests/unit/messages.test.ts unijob-web/functions/tests/unit/jobs.test.ts
git commit -m "feat(functions): add notification message builders and job reader [task:1]"
```

---

### Task 2: Application triggers (new_application, application_accepted, application_rejected)

**Independent of Tasks 3 to 6.**

**Files:**
- Create: `unijob-web/functions/src/handlers/applications.ts`
- Create: `unijob-web/functions/src/triggers/applications.ts`
- Test: `unijob-web/functions/tests/unit/handlers/applications.test.ts`
- Test: `unijob-web/functions/tests/unit/triggers/applications.test.ts`
- Test: `unijob-web/functions/tests/emulator/applications.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `readJob`, `FALLBACK_JOB_TITLE`, `FALLBACK_APPLICANT_NAME`, `messages`, `fakeDb`, `connectEmulatorDb`, `notificationsFor`; existing `writeNotification(db, input): Promise<boolean>`.
- Produces:
  - `handleApplicationCreated(db: Firestore, appId: string, app: DocumentData | undefined): Promise<boolean>`
  - `handleApplicationUpdated(db: Firestore, appId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<boolean>`
  - `onApplicationCreated`, `onApplicationUpdated` (v2 Firestore triggers on `applications/{appId}`)

- [ ] **Step 1: Write the failing handler unit tests**

`unijob-web/functions/tests/unit/handlers/applications.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleApplicationCreated, handleApplicationUpdated } from '../../../src/handlers/applications.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({ 'jobs/j1': { title: 'Nhập liệu', postedBy: 'poster', status: 'open' } });
const app = { jobId: 'j1', applicantId: 'carol', applicantName: 'Carol', status: 'pending' };

beforeEach(() => vi.clearAllMocks());

describe('handleApplicationCreated', () => {
  it('notifies the poster with new_application keyed by the application id', async () => {
    await expect(handleApplicationCreated(db, 'j1_carol', app)).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'poster',
      type: 'new_application',
      message: 'Carol đã ứng tuyển "Nhập liệu"',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu', fromName: 'Carol' },
      sourceId: 'j1_carol',
    });
  });
  it('uses "Một ứng viên" when the applicant name is missing or blank', async () => {
    await handleApplicationCreated(db, 'j1_carol', { ...app, applicantName: '  ' });
    expect(vi.mocked(writeNotification).mock.calls[0][1]).toMatchObject({
      message: 'Một ứng viên đã ứng tuyển "Nhập liệu"',
      extras: { fromName: 'Một ứng viên' },
    });
  });
  it('does nothing when the applicant is the poster, the job is missing, or the data is malformed', async () => {
    await expect(handleApplicationCreated(db, 'j1_poster', { ...app, applicantId: 'poster' })).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'x_carol', { ...app, jobId: 'missing' })).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'x_carol', { ...app, jobId: 'a/b' })).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'j1_carol', { ...app, applicantId: 42 })).resolves.toBe(false);
    await expect(handleApplicationCreated(db, 'j1_carol', undefined)).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
});

describe('handleApplicationUpdated', () => {
  it.each([
    ['accepted', 'application_accepted', '🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!'],
    ['rejected', 'application_rejected', 'Đơn ứng tuyển "Nhập liệu" không được chấp nhận'],
  ] as const)('pending -> %s notifies the applicant', async (status, type, message) => {
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status })).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'carol',
      type,
      message,
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu' },
      sourceId: 'j1_carol',
    });
  });
  it('falls back to "công việc" when the job is gone (same as the old client)', async () => {
    await handleApplicationUpdated(db, 'x_carol', { ...app, jobId: 'gone' }, { ...app, jobId: 'gone', status: 'rejected' });
    expect(vi.mocked(writeNotification).mock.calls[0][1]).toMatchObject({
      message: 'Đơn ứng tuyển "công việc" không được chấp nhận',
      extras: { jobId: 'gone', jobTitle: 'công việc' },
    });
  });
  it('ignores updates that are not a pending decision', async () => {
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, message: 'edited' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', { ...app, status: 'accepted' }, { ...app, status: 'rejected' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status: 'weird' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', app, { ...app, status: 'accepted', applicantId: '' })).resolves.toBe(false);
    await expect(handleApplicationUpdated(db, 'j1_carol', undefined, app)).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/applications.test.ts`
Expected: FAIL, cannot resolve `src/handlers/applications.js`.

- [ ] **Step 3: Implement the handlers**

`unijob-web/functions/src/handlers/applications.ts`:

```ts
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FALLBACK_APPLICANT_NAME, FALLBACK_JOB_TITLE, isDocId, readJob } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** applications/{appId} created -> new_application to the job's poster. */
export async function handleApplicationCreated(db: Firestore, appId: string, app: DocumentData | undefined): Promise<boolean> {
  if (!app) return false;
  const applicantId = str(app.applicantId);
  if (!applicantId) return false;
  const job = await readJob(db, app.jobId);
  if (!job || !job.postedBy) {
    logger.warn('new_application: job not found, no notification', { appId });
    return false;
  }
  if (job.postedBy === applicantId) return false;
  const name = str(app.applicantName).trim() ? str(app.applicantName) : FALLBACK_APPLICANT_NAME;
  return writeNotification(db, {
    userId: job.postedBy,
    type: 'new_application',
    message: messages.newApplication(name, job.title),
    extras: { jobId: job.id, jobTitle: job.title, fromName: name },
    sourceId: appId,
  });
}

/** applications/{appId} pending -> accepted|rejected -> notify the applicant. */
export async function handleApplicationUpdated(
  db: Firestore,
  appId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<boolean> {
  if (!before || !after || before.status !== 'pending') return false;
  const status = after.status;
  if (status !== 'accepted' && status !== 'rejected') return false;
  const applicantId = str(after.applicantId);
  if (!applicantId) return false;
  const jobId = isDocId(after.jobId) ? after.jobId : undefined;
  const job = await readJob(db, jobId);
  const title = job?.title ?? FALLBACK_JOB_TITLE;
  return writeNotification(db, {
    userId: applicantId,
    type: status === 'accepted' ? 'application_accepted' : 'application_rejected',
    message: status === 'accepted' ? messages.applicationAccepted(title) : messages.applicationRejected(title),
    extras: { jobId, jobTitle: title },
    sourceId: appId,
  });
}
```

Note: `writeNotification` drops `extras.jobId` when it is `undefined`, so the extras object can be passed as is.

- [ ] **Step 4: Run handler tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/applications.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing trigger wiring test**

`unijob-web/functions/tests/unit/triggers/applications.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/applications.js', () => ({
  handleApplicationCreated: vi.fn(async () => true),
  handleApplicationUpdated: vi.fn(async () => true),
}));

import { handleApplicationCreated, handleApplicationUpdated } from '../../../src/handlers/applications.js';
import { onApplicationCreated, onApplicationUpdated } from '../../../src/triggers/applications.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('application triggers', () => {
  it('are bound to applications/{appId} on the named database in asia-southeast1', () => {
    for (const fn of [onApplicationCreated, onApplicationUpdated]) {
      expect(fn.__endpoint.region).toEqual(['asia-southeast1']);
      expect(fn.__endpoint.eventTrigger).toMatchObject({
        eventFilters: { database: 'kirigitejkf8095h' },
        eventFilterPathPatterns: { document: 'applications/{appId}' },
      });
    }
    expect(onApplicationCreated.__endpoint.eventTrigger?.eventType).toBe('google.cloud.firestore.document.v1.created');
    expect(onApplicationUpdated.__endpoint.eventTrigger?.eventType).toBe('google.cloud.firestore.document.v1.updated');
  });

  it('onApplicationCreated passes db, the id and the data to the handler', async () => {
    await onApplicationCreated.run({ params: { appId: 'j1_carol' }, data: snap({ jobId: 'j1' }) } as never);
    expect(handleApplicationCreated).toHaveBeenCalledWith({ fake: 'db' }, 'j1_carol', { jobId: 'j1' });
  });

  it('onApplicationUpdated passes before and after', async () => {
    await onApplicationUpdated.run({
      params: { appId: 'j1_carol' },
      data: { before: snap({ status: 'pending' }), after: snap({ status: 'accepted' }) },
    } as never);
    expect(handleApplicationUpdated).toHaveBeenCalledWith({ fake: 'db' }, 'j1_carol', { status: 'pending' }, { status: 'accepted' });
  });

  it('tolerates an event without data', async () => {
    await onApplicationCreated.run({ params: { appId: 'x' }, data: undefined } as never);
    expect(handleApplicationCreated).toHaveBeenCalledWith({ fake: 'db' }, 'x', undefined);
  });
});
```

If `__endpoint` nests a field differently in firebase-functions 7.4.0 (print it once with `console.log(JSON.stringify(fn.__endpoint))`), adjust the path of the assertion only; it must still assert region, database, document pattern and event type.

- [ ] **Step 6: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/applications.test.ts`
Expected: FAIL, cannot resolve `src/triggers/applications.js`.

- [ ] **Step 7: Implement the triggers**

`unijob-web/functions/src/triggers/applications.ts`:

```ts
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleApplicationCreated, handleApplicationUpdated } from '../handlers/applications.js';

const opts = { document: 'applications/{appId}', database: DATABASE_ID, region: REGION } as const;

export const onApplicationCreated = onDocumentCreated(opts, async (event) => {
  await handleApplicationCreated(db, event.params.appId, event.data?.data());
});

export const onApplicationUpdated = onDocumentUpdated(opts, async (event) => {
  await handleApplicationUpdated(db, event.params.appId, event.data?.before.data(), event.data?.after.data());
});
```

- [ ] **Step 8: Run unit tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/applications.test.ts tests/unit/triggers/applications.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Write the emulator test**

`unijob-web/functions/tests/emulator/applications.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleApplicationCreated, handleApplicationUpdated } from '../../src/handlers/applications.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function seed() {
  const poster = uid('poster');
  const applicant = uid('carol');
  const jobId = uid('job');
  const appId = `${jobId}_${applicant}`;
  await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'open', applicants: [applicant], assignedTo: [] });
  await db.doc(`applications/${appId}`).set({ jobId, applicantId: applicant, applicantName: 'Carol', applicantPhoto: '', message: 'hi', status: 'pending' });
  return { poster, applicant, jobId, appId };
}

describe('application notifications on the emulator', () => {
  it('a new application creates exactly one new_application for the poster, also when delivered twice', async () => {
    const { poster, jobId, appId } = await seed();
    const data = (await db.doc(`applications/${appId}`).get()).data();
    await expect(handleApplicationCreated(db, appId, data)).resolves.toBe(true);
    await expect(handleApplicationCreated(db, appId, data)).resolves.toBe(false);
    const docs = await notificationsFor(db, poster);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(`new_application_${appId}`);
    expect(docs[0].data()).toMatchObject({
      type: 'new_application',
      message: 'Carol đã ứng tuyển "Nhập liệu"',
      jobId,
      jobTitle: 'Nhập liệu',
      fromName: 'Carol',
      read: false,
      source: 'server',
    });
  });

  it('accepting creates exactly one application_accepted for the applicant (concurrent redelivery)', async () => {
    const { applicant, appId } = await seed();
    const before = (await db.doc(`applications/${appId}`).get()).data();
    await db.doc(`applications/${appId}`).update({ status: 'accepted' });
    const after = (await db.doc(`applications/${appId}`).get()).data();
    const results = await Promise.all([
      handleApplicationUpdated(db, appId, before, after),
      handleApplicationUpdated(db, appId, before, after),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const docs = await notificationsFor(db, applicant);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(`application_accepted_${appId}`);
    expect(docs[0].get('message')).toBe('🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!');
  });

  it('rejecting creates exactly one application_rejected', async () => {
    const { applicant, appId } = await seed();
    const before = (await db.doc(`applications/${appId}`).get()).data();
    await db.doc(`applications/${appId}`).update({ status: 'rejected' });
    const after = (await db.doc(`applications/${appId}`).get()).data();
    await handleApplicationUpdated(db, appId, before, after);
    await handleApplicationUpdated(db, appId, before, after);
    const docs = await notificationsFor(db, applicant);
    expect(docs.map((d) => d.id)).toEqual([`application_rejected_${appId}`]);
  });

  it('a 5000-character title is clipped in the message and the write succeeds', async () => {
    const { poster, jobId, appId } = await seed();
    await db.doc(`jobs/${jobId}`).update({ title: '"'.repeat(5000) });
    await handleApplicationCreated(db, appId, (await db.doc(`applications/${appId}`).get()).data());
    const [doc] = await notificationsFor(db, poster);
    expect(Array.from(doc.get('message') as string).length).toBeLessThan(200);
  });
});
```

- [ ] **Step 10: Run the emulator tests**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/applications.emulator.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 11: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS; coverage gate shows the new `functions/src/handlers/applications.ts` and `functions/src/triggers/applications.ts` at 70% or more.

- [ ] **Step 12: Commit**

```bash
git add unijob-web/functions/src/handlers/applications.ts unijob-web/functions/src/triggers/applications.ts unijob-web/functions/tests/unit/handlers/applications.test.ts unijob-web/functions/tests/unit/triggers/applications.test.ts unijob-web/functions/tests/emulator/applications.emulator.test.ts
git commit -m "feat(functions): notify on new and decided applications server-side [task:2]"
```

---

### Task 3: Job status trigger (job_cancelled, job_completed)

**Independent of Tasks 2, 4, 5, 6.**

**Files:**
- Create: `unijob-web/functions/src/handlers/jobs.ts`
- Create: `unijob-web/functions/src/triggers/jobs.ts`
- Test: `unijob-web/functions/tests/unit/handlers/jobs.test.ts`
- Test: `unijob-web/functions/tests/unit/triggers/jobs.test.ts`
- Test: `unijob-web/functions/tests/emulator/jobs.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `toJobInfo`, `messages`, `connectEmulatorDb`, `notificationsFor`; `writeNotification`.
- Produces:
  - `handleJobUpdated(db: Firestore, jobId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<number>` (number of notifications newly written)
  - `onJobUpdated` (v2 `onDocumentUpdated` on `jobs/{jobId}`)

- [ ] **Step 1: Write the failing handler unit tests**

`unijob-web/functions/tests/unit/handlers/jobs.test.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleJobUpdated } from '../../../src/handlers/jobs.js';
import { writeNotification } from '../../../src/lib/notifications.js';

const db = {} as Firestore; // the handler must not read: before/after carry everything
const job = { title: 'Nhập liệu', postedBy: 'poster', assignedTo: ['w1'], status: 'in-progress' };
const sent = () => vi.mocked(writeNotification).mock.calls.map((c) => c[1]);

beforeEach(() => vi.clearAllMocks());

describe('handleJobUpdated: cancelled', () => {
  it('notifies every assigned worker (before or after the write) with job_cancelled keyed by job and worker', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'cancelled', assignedTo: ['w2'] })).resolves.toBe(2);
    expect(sent()).toEqual([
      { userId: 'w1', type: 'job_cancelled', message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w1' },
      { userId: 'w2', type: 'job_cancelled', message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w2' },
    ]);
  });
  it('sends nothing for an open job without workers (deadline expiry, poster cancel before assigning)', async () => {
    const open = { ...job, status: 'open', assignedTo: [] };
    await expect(handleJobUpdated(db, 'j1', open, { ...open, status: 'cancelled' })).resolves.toBe(0);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('never notifies the poster as a worker, and ignores junk assignees', async () => {
    await handleJobUpdated(db, 'j1', { ...job, assignedTo: ['poster', 7, ''] }, { ...job, status: 'cancelled', assignedTo: ['poster'] });
    expect(writeNotification).not.toHaveBeenCalled();
  });
});

describe('handleJobUpdated: completed', () => {
  it('notifies the worker and the poster with their own texts and ids', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'completed' })).resolves.toBe(2);
    expect(sent()).toEqual([
      { userId: 'w1', type: 'job_completed', message: '🎉 Công việc "Nhập liệu" đã hoàn thành! Hãy để lại đánh giá.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_w1' },
      { userId: 'poster', type: 'job_completed', message: '✅ Công việc "Nhập liệu" đã được xác nhận hoàn thành.', extras: { jobId: 'j1', jobTitle: 'Nhập liệu' }, sourceId: 'j1_poster' },
    ]);
  });
  it('sends nothing without an assigned worker (same as the old client)', async () => {
    await expect(handleJobUpdated(db, 'j1', { ...job, assignedTo: [] }, { ...job, assignedTo: [], status: 'completed' })).resolves.toBe(0);
  });
});

describe('handleJobUpdated: everything else', () => {
  it('ignores updates that keep the status (e.g. applicants arrayUnion) and other transitions', async () => {
    await expect(handleJobUpdated(db, 'j1', job, { ...job, applicants: ['x'] })).resolves.toBe(0);
    await expect(handleJobUpdated(db, 'j1', { ...job, status: 'open' }, job)).resolves.toBe(0);
    await expect(handleJobUpdated(db, 'j1', undefined, job)).resolves.toBe(0);
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('counts only newly written notifications (redelivery returns 0)', async () => {
    vi.mocked(writeNotification).mockResolvedValue(false);
    await expect(handleJobUpdated(db, 'j1', job, { ...job, status: 'completed' })).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/jobs.test.ts`
Expected: FAIL, cannot resolve `src/handlers/jobs.js`.

- [ ] **Step 3: Implement the handler**

`unijob-web/functions/src/handlers/jobs.ts`:

```ts
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { toJobInfo } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification, type NotificationInput } from '../lib/notifications.js';

/**
 * jobs/{jobId} status changes:
 * - -> cancelled: job_cancelled to every assigned worker (before or after the write).
 * - -> completed: job_completed to each assigned worker and to the poster.
 * The same type goes to several users, so sourceId is `${jobId}_${uid}`.
 */
export async function handleJobUpdated(
  db: Firestore,
  jobId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<number> {
  if (!before || !after || before.status === after.status) return 0;
  const was = toJobInfo(jobId, before);
  const job = toJobInfo(jobId, after);
  if (!was || !job) return 0;
  const extras = { jobId, jobTitle: job.title };
  const notMe = (uid: string) => uid !== job.postedBy;
  const inputs: NotificationInput[] = [];

  if (job.status === 'cancelled') {
    const workers = [...new Set([...was.assignedTo, ...job.assignedTo])].filter(notMe);
    for (const uid of workers) {
      inputs.push({ userId: uid, type: 'job_cancelled', message: messages.jobCancelledByPoster(job.title), extras, sourceId: `${jobId}_${uid}` });
    }
  } else if (job.status === 'completed') {
    const workers = job.assignedTo.filter(notMe);
    for (const uid of workers) {
      inputs.push({ userId: uid, type: 'job_completed', message: messages.jobCompletedWorker(job.title), extras, sourceId: `${jobId}_${uid}` });
    }
    if (workers.length > 0 && job.postedBy) {
      inputs.push({
        userId: job.postedBy,
        type: 'job_completed',
        message: messages.jobCompletedPoster(job.title),
        extras,
        sourceId: `${jobId}_${job.postedBy}`,
      });
    }
  }

  const written = await Promise.all(inputs.map((input) => writeNotification(db, input)));
  return written.filter(Boolean).length;
}
```

- [ ] **Step 4: Run handler tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing trigger wiring test**

`unijob-web/functions/tests/unit/triggers/jobs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/jobs.js', () => ({ handleJobUpdated: vi.fn(async () => 0) }));

import { handleJobUpdated } from '../../../src/handlers/jobs.js';
import { onJobUpdated } from '../../../src/triggers/jobs.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });

describe('onJobUpdated', () => {
  it('is bound to jobs/{jobId} updates on the named database in asia-southeast1', () => {
    expect(onJobUpdated.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobUpdated.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.updated',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobs/{jobId}' },
    });
  });
  it('passes db, id, before and after', async () => {
    await onJobUpdated.run({
      params: { jobId: 'j1' },
      data: { before: snap({ status: 'open' }), after: snap({ status: 'cancelled' }) },
    } as never);
    expect(handleJobUpdated).toHaveBeenCalledWith({ fake: 'db' }, 'j1', { status: 'open' }, { status: 'cancelled' });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/jobs.test.ts`
Expected: FAIL, cannot resolve `src/triggers/jobs.js`.

- [ ] **Step 7: Implement the trigger**

`unijob-web/functions/src/triggers/jobs.ts`:

```ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleJobUpdated } from '../handlers/jobs.js';

export const onJobUpdated = onDocumentUpdated(
  { document: 'jobs/{jobId}', database: DATABASE_ID, region: REGION },
  async (event) => {
    await handleJobUpdated(db, event.params.jobId, event.data?.before.data(), event.data?.after.data());
  },
);
```

- [ ] **Step 8: Run unit tests and typecheck**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/jobs.test.ts tests/unit/triggers/jobs.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Write the emulator test**

`unijob-web/functions/tests/emulator/jobs.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleJobUpdated } from '../../src/handlers/jobs.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

async function transition(status: 'cancelled' | 'completed') {
  const poster = uid('poster');
  const worker = uid('worker');
  const jobId = uid('job');
  const ref = db.doc(`jobs/${jobId}`);
  await ref.set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', applicants: [worker], assignedTo: [worker] });
  const before = (await ref.get()).data();
  await ref.update({ status });
  const after = (await ref.get()).data();
  return { poster, worker, jobId, before, after };
}

describe('job status notifications on the emulator', () => {
  it('cancel: exactly one job_cancelled for the worker, none for the poster, idempotent', async () => {
    const { poster, worker, jobId, before, after } = await transition('cancelled');
    await expect(handleJobUpdated(db, jobId, before, after)).resolves.toBe(1);
    await expect(handleJobUpdated(db, jobId, before, after)).resolves.toBe(0);
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`job_cancelled_${jobId}_${worker}`]);
    expect(docs[0].data()).toMatchObject({ message: 'Công việc "Nhập liệu" đã bị người đăng hủy.', jobId, source: 'server' });
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });

  it('complete: exactly one job_completed each for worker and poster, idempotent under concurrency', async () => {
    const { poster, worker, jobId, before, after } = await transition('completed');
    const counts = await Promise.all([handleJobUpdated(db, jobId, before, after), handleJobUpdated(db, jobId, before, after)]);
    expect(counts[0] + counts[1]).toBe(2);
    expect((await notificationsFor(db, worker)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${worker}`]);
    expect((await notificationsFor(db, poster)).map((d) => d.id)).toEqual([`job_completed_${jobId}_${poster}`]);
  });
});
```

- [ ] **Step 10: Run the emulator tests**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/jobs.emulator.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 11: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS.

- [ ] **Step 12: Commit**

```bash
git add unijob-web/functions/src/handlers/jobs.ts unijob-web/functions/src/triggers/jobs.ts unijob-web/functions/tests/unit/handlers/jobs.test.ts unijob-web/functions/tests/unit/triggers/jobs.test.ts unijob-web/functions/tests/emulator/jobs.emulator.test.ts
git commit -m "feat(functions): notify workers and poster on job cancel and completion [task:3]"
```

---

### Task 4: Completion request trigger (completion_requested)

**Independent of Tasks 2, 3, 5, 6.**

**Files:**
- Create: `unijob-web/functions/src/handlers/completions.ts`
- Create: `unijob-web/functions/src/triggers/completions.ts`
- Test: `unijob-web/functions/tests/unit/handlers/completions.test.ts`
- Test: `unijob-web/functions/tests/unit/triggers/completions.test.ts`
- Test: `unijob-web/functions/tests/emulator/completions.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `readJob`, `messages`, `fakeDb`, `connectEmulatorDb`, `notificationsFor`; `writeNotification`.
- Produces:
  - `handleCompletionWritten(db: Firestore, completionId: string, before: DocumentData | undefined, after: DocumentData | undefined): Promise<boolean>`
  - `onJobCompletionWritten` (v2 `onDocumentWritten` on `jobCompletions/{completionId}`; written, not updated, so a completion created with `workerConfirmed: true` also counts)

- [ ] **Step 1: Write the failing handler unit tests**

`unijob-web/functions/tests/unit/handlers/completions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleCompletionWritten } from '../../../src/handlers/completions.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({
  'jobs/j1': { title: 'Nhập liệu', postedBy: 'poster', assignedTo: ['w1'], status: 'in-progress' },
  'jobs/open': { title: 'Mở', postedBy: 'poster', assignedTo: [], status: 'open' },
  'jobs/done': { title: 'Xong', postedBy: 'poster', assignedTo: ['w1'], status: 'completed' },
});
const pending = { jobId: 'j1', workerConfirmed: false, posterConfirmed: false, status: 'pending' };

beforeEach(() => vi.clearAllMocks());

describe('handleCompletionWritten', () => {
  it('worker confirms first -> completion_requested to the poster, keyed by job', async () => {
    await expect(handleCompletionWritten(db, 'c1', pending, { ...pending, workerConfirmed: true })).resolves.toBe(true);
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'poster',
      type: 'completion_requested',
      message: '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu' },
      sourceId: 'j1',
    });
  });
  it('a completion created already confirmed by the worker also counts', async () => {
    await expect(handleCompletionWritten(db, 'c1', undefined, { ...pending, workerConfirmed: true })).resolves.toBe(true);
  });
  it('no request when the poster already confirmed (the job_completed path handles it)', async () => {
    await expect(
      handleCompletionWritten(db, 'c1', { ...pending, posterConfirmed: true }, { ...pending, posterConfirmed: true, workerConfirmed: true }),
    ).resolves.toBe(false);
  });
  it('ignores non-transitions, deletes, and jobs that are not in progress with a worker', async () => {
    const confirmed = { ...pending, workerConfirmed: true };
    await expect(handleCompletionWritten(db, 'c1', confirmed, { ...confirmed, note: 'x' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'c1', confirmed, undefined)).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'c1', pending, { ...confirmed, jobId: 'open' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'c1', pending, { ...confirmed, jobId: 'done' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'c1', pending, { ...confirmed, jobId: 'missing' })).resolves.toBe(false);
    await expect(handleCompletionWritten(db, 'c1', pending, { ...confirmed, workerConfirmed: 'yes' })).resolves.toBe(false);
    expect(writeNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/completions.test.ts`
Expected: FAIL, cannot resolve `src/handlers/completions.js`.

- [ ] **Step 3: Implement the handler**

`unijob-web/functions/src/handlers/completions.ts`:

```ts
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { readJob } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

/**
 * jobCompletions/{completionId}: the worker's confirmation flips to true while the poster has not
 * confirmed -> completion_requested to the poster.
 *
 * sourceId is the jobId, not the completion id: until slice 5 any signed-in user can write
 * jobCompletions, so keying by job caps forged-document spam at one request per job.
 */
export async function handleCompletionWritten(
  db: Firestore,
  completionId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<boolean> {
  if (!after) return false;
  const workerJustConfirmed = after.workerConfirmed === true && before?.workerConfirmed !== true;
  if (!workerJustConfirmed || after.posterConfirmed === true) return false;
  const job = await readJob(db, after.jobId);
  if (!job || !job.postedBy || job.status !== 'in-progress' || job.assignedTo.length === 0) {
    logger.info('completion_requested: job not in progress with a worker, skipped', { completionId });
    return false;
  }
  return writeNotification(db, {
    userId: job.postedBy,
    type: 'completion_requested',
    message: messages.completionRequested(job.title),
    extras: { jobId: job.id, jobTitle: job.title },
    sourceId: job.id,
  });
}
```

- [ ] **Step 4: Run handler tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/completions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing trigger wiring test**

`unijob-web/functions/tests/unit/triggers/completions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/completions.js', () => ({ handleCompletionWritten: vi.fn(async () => false) }));

import { handleCompletionWritten } from '../../../src/handlers/completions.js';
import { onJobCompletionWritten } from '../../../src/triggers/completions.js';

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('onJobCompletionWritten', () => {
  it('is bound to jobCompletions/{completionId} writes on the named database in asia-southeast1', () => {
    expect(onJobCompletionWritten.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobCompletionWritten.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.written',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobCompletions/{completionId}' },
    });
  });
  it('passes before (undefined on create) and after', async () => {
    await onJobCompletionWritten.run({
      params: { completionId: 'c1' },
      data: { before: snap(undefined), after: snap({ workerConfirmed: true }) },
    } as never);
    expect(handleCompletionWritten).toHaveBeenCalledWith({ fake: 'db' }, 'c1', undefined, { workerConfirmed: true });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/triggers/completions.test.ts`
Expected: FAIL, cannot resolve `src/triggers/completions.js`.

- [ ] **Step 7: Implement the trigger**

`unijob-web/functions/src/triggers/completions.ts`:

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';
import { DATABASE_ID, REGION } from '../config.js';
import { handleCompletionWritten } from '../handlers/completions.js';

export const onJobCompletionWritten = onDocumentWritten(
  { document: 'jobCompletions/{completionId}', database: DATABASE_ID, region: REGION },
  async (event) => {
    await handleCompletionWritten(db, event.params.completionId, event.data?.before.data(), event.data?.after.data());
  },
);
```

- [ ] **Step 8: Run unit tests and typecheck**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/completions.test.ts tests/unit/triggers/completions.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Write the emulator test**

`unijob-web/functions/tests/emulator/completions.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCompletionWritten } from '../../src/handlers/completions.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

describe('completion_requested on the emulator', () => {
  it('worker confirmation creates exactly one request for the poster, also across two completion docs for the same job', async () => {
    const poster = uid('poster');
    const worker = uid('worker');
    const jobId = uid('job');
    await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'in-progress', assignedTo: [worker], applicants: [worker] });
    for (const completionId of [uid('c'), uid('c')]) {
      const ref = db.doc(`jobCompletions/${completionId}`);
      await ref.set({ jobId, workerConfirmed: false, posterConfirmed: false, status: 'pending', completedAt: null });
      const before = (await ref.get()).data();
      await ref.update({ workerConfirmed: true });
      const after = (await ref.get()).data();
      await handleCompletionWritten(db, completionId, before, after);
      await handleCompletionWritten(db, completionId, before, after); // redelivery
    }
    const docs = await notificationsFor(db, poster);
    expect(docs.map((d) => d.id)).toEqual([`completion_requested_${jobId}`]);
    expect(docs[0].data()).toMatchObject({
      message: '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.',
      jobId,
      source: 'server',
    });
    expect(await notificationsFor(db, worker)).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run the emulator tests**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/completions.emulator.test.ts"`
Expected: PASS.

- [ ] **Step 11: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS.

- [ ] **Step 12: Commit**

```bash
git add unijob-web/functions/src/handlers/completions.ts unijob-web/functions/src/triggers/completions.ts unijob-web/functions/tests/unit/handlers/completions.test.ts unijob-web/functions/tests/unit/triggers/completions.test.ts unijob-web/functions/tests/emulator/completions.emulator.test.ts
git commit -m "feat(functions): notify the poster when the worker reports completion [task:4]"
```

---

### Task 5: Scheduled expiry of overdue open jobs (deadline_expired)

**Independent of Tasks 2, 3, 4, 6.**

**Files:**
- Create: `unijob-web/functions/src/handlers/expireJobs.ts`
- Create: `unijob-web/functions/src/scheduled/expireJobs.ts`
- Modify: `unijob-web/firestore.indexes.json` (append one index)
- Test: `unijob-web/functions/tests/unit/scheduled/expireJobs.test.ts`
- Test: `unijob-web/functions/tests/emulator/expireJobs.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `toJobInfo`, `messages`, `connectEmulatorDb`, `notificationsFor`; `writeNotification`.
- Produces:
  - `interface ExpireOptions { pageSize?: number; maxPages?: number }` (defaults 200 and 50)
  - `interface ExpireResult { expired: number; notified: number; skipped: number }`
  - `expireOverdueJobs(db: Firestore, now: Timestamp, options?: ExpireOptions): Promise<ExpireResult>`
  - `expireJobs` (v2 `onSchedule`, `every 30 minutes`, time zone `Asia/Ho_Chi_Minh`)

The handler is exercised against the emulator (the query, pagination and preconditions are what matter); the unit test covers the schedule wiring. Both count toward coverage in `--full`.

- [ ] **Step 1: Write the failing emulator test**

`unijob-web/functions/tests/emulator/expireJobs.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { expireOverdueJobs } from '../../src/handlers/expireJobs.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;
const NOW = Timestamp.fromMillis(Date.UTC(2026, 9, 17, 3, 0, 0));
const hoursFromNow = (h: number) => Timestamp.fromMillis(NOW.toMillis() + h * 3_600_000);

async function job(poster: string, over: Record<string, unknown>) {
  const id = uid('job');
  await db.doc(`jobs/${id}`).set({ title: 'Nhập liệu', postedBy: poster, status: 'open', applicants: [], assignedTo: [], deadline: hoursFromNow(-1), ...over });
  return id;
}
const statusOf = async (id: string) => (await db.doc(`jobs/${id}`).get()).get('status');

describe('expireOverdueJobs on the emulator', () => {
  it('cancels only open jobs past their deadline and notifies each poster once, across pages and reruns', async () => {
    const poster = uid('poster');
    const overdue = await Promise.all([1, 2, 3, 4, 5].map((h) => job(poster, { deadline: hoursFromNow(-h) })));
    const future = await job(poster, { deadline: hoursFromNow(5) });
    const inProgress = await job(poster, { status: 'in-progress' });
    const stringDeadline = await job(poster, { deadline: '2020-01-01' });

    const first = await expireOverdueJobs(db, NOW, { pageSize: 2 });
    expect(first.expired).toBeGreaterThanOrEqual(5);
    for (const id of overdue) expect(await statusOf(id)).toBe('cancelled');
    expect(await statusOf(future)).toBe('open');
    expect(await statusOf(inProgress)).toBe('in-progress');
    expect(await statusOf(stringDeadline)).toBe('open');

    await expireOverdueJobs(db, NOW, { pageSize: 2 }); // rerun: nothing new for this poster
    const docs = await notificationsFor(db, poster);
    expect(docs.map((d) => d.id).sort()).toEqual(overdue.map((id) => `deadline_expired_${id}`).sort());
    expect(docs[0].data()).toMatchObject({
      type: 'deadline_expired',
      message: '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.',
      source: 'server',
    });
  });

  it('stops after maxPages and leaves the rest for the next run', async () => {
    const poster = uid('poster');
    await Promise.all([1, 2, 3].map((h) => job(poster, { deadline: hoursFromNow(-1000 - h) })));
    const capped = await expireOverdueJobs(db, NOW, { pageSize: 1, maxPages: 1 });
    expect(capped.expired).toBe(1);
  });

  it('skips a job its poster edited after the query (precondition) and sends no notification', async () => {
    const poster = uid('poster');
    const id = await job(poster, { deadline: hoursFromNow(-2000) });
    const racing = await expireOverdueJobs(db, NOW, {
      pageSize: 50,
      beforeWrite: async () => {
        await db.doc(`jobs/${id}`).update({ deadline: hoursFromNow(48) });
      },
    });
    expect(racing.skipped).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe('open');
    expect(await notificationsFor(db, poster)).toHaveLength(0);
  });
});
```

`beforeWrite` is a test seam on `ExpireOptions` (`beforeWrite?: () => Promise<void>`, called once per page after the query and before the updates). Add it to the `ExpireOptions` interface; production code never passes it.

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/expireJobs.emulator.test.ts"`
Expected: FAIL, cannot resolve `src/handlers/expireJobs.js`.

- [ ] **Step 3: Implement the handler**

`unijob-web/functions/src/handlers/expireJobs.ts`:

```ts
import { FieldValue, type Firestore, type QueryDocumentSnapshot, type Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { toJobInfo } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

export interface ExpireOptions {
  pageSize?: number;
  maxPages?: number;
  /** Test seam: runs after each page's query, before its writes. */
  beforeWrite?: () => Promise<void>;
}

export interface ExpireResult {
  expired: number;
  notified: number;
  /** Jobs changed after the query (precondition failed) or that failed to update; retried next run. */
  skipped: number;
}

/**
 * Open jobs whose deadline passed -> status 'cancelled', then deadline_expired to the poster.
 * Replaces the client-side cleanup.service.ts. Each update carries a lastUpdateTime precondition so
 * a job its poster just edited is left alone, and only jobs actually cancelled are notified.
 * Needs the composite index jobs(status ASC, deadline ASC).
 */
export async function expireOverdueJobs(
  db: Firestore,
  now: Timestamp,
  { pageSize = 200, maxPages = 50, beforeWrite }: ExpireOptions = {},
): Promise<ExpireResult> {
  const result: ExpireResult = { expired: 0, notified: 0, skipped: 0 };
  let cursor: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < maxPages; page++) {
    let query = db.collection('jobs').where('status', '==', 'open').where('deadline', '<', now).orderBy('deadline').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) return result;
    await beforeWrite?.();

    await Promise.all(
      snap.docs.map(async (doc) => {
        try {
          await doc.ref.update({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: doc.updateTime });
        } catch (err) {
          result.skipped++;
          logger.info('expireOverdueJobs: job changed or update failed, left for the next run', { jobId: doc.id, err: String(err) });
          return;
        }
        result.expired++;
        const job = toJobInfo(doc.id, doc.data());
        if (!job?.postedBy) return;
        try {
          const written = await writeNotification(db, {
            userId: job.postedBy,
            type: 'deadline_expired',
            message: messages.deadlineExpired(job.title),
            extras: { jobId: job.id, jobTitle: job.title },
            sourceId: job.id,
          });
          if (written) result.notified++;
        } catch (err) {
          logger.error('deadline_expired: job cancelled but notification failed', { jobId: doc.id, err: String(err) });
        }
      }),
    );

    if (snap.size < pageSize) return result;
    cursor = snap.docs[snap.docs.length - 1];
  }
  logger.warn('expireOverdueJobs: page limit reached, the rest is handled by the next run', { maxPages, pageSize });
  return result;
}
```

- [ ] **Step 4: Run the emulator test to verify it passes**

Run: same command as Step 2.
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing schedule wiring test**

`unijob-web/functions/tests/unit/scheduled/expireJobs.test.ts`:

```ts
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/expireJobs.js', () => ({
  expireOverdueJobs: vi.fn(async () => ({ expired: 2, notified: 2, skipped: 0 })),
}));

import { expireOverdueJobs } from '../../../src/handlers/expireJobs.js';
import { expireJobs } from '../../../src/scheduled/expireJobs.js';

describe('expireJobs', () => {
  it('runs every 30 minutes in Asia/Ho_Chi_Minh, in asia-southeast1', () => {
    expect(expireJobs.__endpoint.region).toEqual(['asia-southeast1']);
    expect(expireJobs.__endpoint.scheduleTrigger).toMatchObject({ schedule: 'every 30 minutes', timeZone: 'Asia/Ho_Chi_Minh' });
  });
  it('calls the handler with the Admin db and the current time', async () => {
    const before = Date.now();
    await expireJobs.run({ scheduleTime: new Date().toISOString(), jobName: 'test' } as never);
    const [db, now] = vi.mocked(expireOverdueJobs).mock.calls[0];
    expect(db).toEqual({ fake: 'db' });
    expect(now).toBeInstanceOf(Timestamp);
    expect((now as Timestamp).toMillis()).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/scheduled/expireJobs.test.ts`
Expected: FAIL, cannot resolve `src/scheduled/expireJobs.js`.

- [ ] **Step 7: Implement the schedule and the index**

`unijob-web/functions/src/scheduled/expireJobs.ts`:

```ts
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { expireOverdueJobs } from '../handlers/expireJobs.js';

export const expireJobs = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Asia/Ho_Chi_Minh', region: REGION },
  async () => {
    const result = await expireOverdueJobs(db, Timestamp.now());
    logger.info('expireJobs done', result);
  },
);
```

Append to the `indexes` array in `unijob-web/firestore.indexes.json` (keep existing entries unchanged):

```json
    {
      "collectionGroup": "jobs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "deadline", "order": "ASCENDING" }
      ]
    }
```

- [ ] **Step 8: Run unit test, typecheck and the emulator test**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/scheduled/expireJobs.test.ts && npm run typecheck && node -e "JSON.parse(require('fs').readFileSync('../firestore.indexes.json','utf8'))"`
Expected: PASS, JSON parses.

- [ ] **Step 9: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS; `functions/src/handlers/expireJobs.ts` and `functions/src/scheduled/expireJobs.ts` at 70% lines or more.

- [ ] **Step 10: Commit**

```bash
git add unijob-web/functions/src/handlers/expireJobs.ts unijob-web/functions/src/scheduled/expireJobs.ts unijob-web/firestore.indexes.json unijob-web/functions/tests/unit/scheduled/expireJobs.test.ts unijob-web/functions/tests/emulator/expireJobs.emulator.test.ts
git commit -m "feat(functions): expire overdue open jobs on a schedule and notify posters [task:5]"
```

---

### Task 6: Callable `sendJobInvite` (job_invite)

**Independent of Tasks 2 to 5.**

**Files:**
- Create: `unijob-web/functions/src/handlers/invites.ts`
- Create: `unijob-web/functions/src/callables/sendJobInvite.ts`
- Test: `unijob-web/functions/tests/unit/handlers/invites.test.ts`
- Test: `unijob-web/functions/tests/unit/callables/sendJobInvite.test.ts`
- Test: `unijob-web/functions/tests/emulator/invites.emulator.test.ts`

**Interfaces:**
- Consumes (Task 1): `readJob`, `isDocId`, `FALLBACK_POSTER_NAME`, `messages`, `fakeDb`, `connectEmulatorDb`, `notificationsFor`; existing `requireAuth`, `MSG_JOB_NOT_FOUND` (`src/lib/auth.ts`), `writeNotification`.
- Produces (plan 3b's client relies on these exact names):
  - callable name `sendJobInvite`, region `asia-southeast1`, request `{ jobId: string; workerId: string }`, response `{ sent: boolean }`
  - `interface SendJobInviteResult { sent: boolean }`
  - `INVITE_MSG = { invalid: 'Lời mời không hợp lệ.', self: 'Bạn không thể tự mời chính mình.', notPoster: 'Chỉ người đăng việc mới gửi được lời mời.', notOpen: 'Công việc này không còn nhận ứng viên.', workerNotFound: 'Không tìm thấy người được mời.' }`
  - `handleSendJobInvite(db: Firestore, uid: string, data: unknown): Promise<SendJobInviteResult>`

- [ ] **Step 1: Write the failing handler unit tests**

`unijob-web/functions/tests/unit/handlers/invites.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/notifications.js', () => ({ writeNotification: vi.fn(async () => true) }));

import { handleSendJobInvite, INVITE_MSG } from '../../../src/handlers/invites.js';
import { MSG_JOB_NOT_FOUND } from '../../../src/lib/auth.js';
import { writeNotification } from '../../../src/lib/notifications.js';
import { fakeDb } from '../../support/fakeDb.js';

const db = fakeDb({
  'jobs/j1': { title: 'Nhập liệu', postedBy: 'alice', postedByName: 'Alice', status: 'open' },
  'jobs/anon': { title: 'Bí mật', postedBy: 'alice', postedByName: 'Ẩn danh', status: 'open' },
  'jobs/noname': { title: 'T', postedBy: 'alice', status: 'open' },
  'jobs/busy': { title: 'T', postedBy: 'alice', postedByName: 'Alice', status: 'in-progress' },
  'users/bob': { displayName: 'Bob' },
});

beforeEach(() => vi.clearAllMocks());

describe('handleSendJobInvite', () => {
  it('notifies the worker with job_invite keyed by job and worker', async () => {
    await expect(handleSendJobInvite(db, 'alice', { jobId: 'j1', workerId: 'bob' })).resolves.toEqual({ sent: true });
    expect(writeNotification).toHaveBeenCalledWith(db, {
      userId: 'bob',
      type: 'job_invite',
      message: 'Alice mời bạn ứng tuyển "Nhập liệu"',
      extras: { jobId: 'j1', jobTitle: 'Nhập liệu', fromName: 'Alice' },
      sourceId: 'j1_bob',
    });
  });
  it('keeps anonymous jobs anonymous and falls back to "Người đăng việc"', async () => {
    await handleSendJobInvite(db, 'alice', { jobId: 'anon', workerId: 'bob' });
    await handleSendJobInvite(db, 'alice', { jobId: 'noname', workerId: 'bob' });
    const [anon, noname] = vi.mocked(writeNotification).mock.calls.map((c) => c[1]);
    expect(anon.message).toBe('Ẩn danh mời bạn ứng tuyển "Bí mật"');
    expect(noname.extras?.fromName).toBe('Người đăng việc');
  });
  it('returns sent: false for a repeat invite', async () => {
    vi.mocked(writeNotification).mockResolvedValueOnce(false);
    await expect(handleSendJobInvite(db, 'alice', { jobId: 'j1', workerId: 'bob' })).resolves.toEqual({ sent: false });
  });
  it.each([
    [null, 'invalid-argument', INVITE_MSG.invalid],
    ['x', 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'j1' }, 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'a/b', workerId: 'bob' }, 'invalid-argument', INVITE_MSG.invalid],
    [{ jobId: 'j1', workerId: 'alice' }, 'invalid-argument', INVITE_MSG.self],
    [{ jobId: 'missing', workerId: 'bob' }, 'not-found', MSG_JOB_NOT_FOUND],
    [{ jobId: 'busy', workerId: 'bob' }, 'failed-precondition', INVITE_MSG.notOpen],
    [{ jobId: 'j1', workerId: 'ghost' }, 'not-found', INVITE_MSG.workerNotFound],
  ])('rejects %j with %s', async (data, code, message) => {
    await expect(handleSendJobInvite(db, 'alice', data)).rejects.toMatchObject({ code, message });
    expect(writeNotification).not.toHaveBeenCalled();
  });
  it('only the poster may invite', async () => {
    await expect(handleSendJobInvite(db, 'mallory', { jobId: 'j1', workerId: 'bob' })).rejects.toMatchObject({
      code: 'permission-denied',
      message: INVITE_MSG.notPoster,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/invites.test.ts`
Expected: FAIL, cannot resolve `src/handlers/invites.js`.

- [ ] **Step 3: Implement the handler**

`unijob-web/functions/src/handlers/invites.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { MSG_JOB_NOT_FOUND } from '../lib/auth.js';
import { FALLBACK_POSTER_NAME, isDocId, readJob } from '../lib/jobs.js';
import { messages } from '../lib/messages.js';
import { writeNotification } from '../lib/notifications.js';

export interface SendJobInviteResult {
  sent: boolean;
}

export const INVITE_MSG = {
  invalid: 'Lời mời không hợp lệ.',
  self: 'Bạn không thể tự mời chính mình.',
  notPoster: 'Chỉ người đăng việc mới gửi được lời mời.',
  notOpen: 'Công việc này không còn nhận ứng viên.',
  workerNotFound: 'Không tìm thấy người được mời.',
} as const;

/**
 * The poster of an open job invites a worker. fromName is the job's postedByName ('Ẩn danh' for
 * anonymous jobs), never the caller's profile name. One invite per worker per job.
 */
export async function handleSendJobInvite(db: Firestore, uid: string, data: unknown): Promise<SendJobInviteResult> {
  const { jobId, workerId } = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (!isDocId(jobId) || !isDocId(workerId)) throw new HttpsError('invalid-argument', INVITE_MSG.invalid);
  if (workerId === uid) throw new HttpsError('invalid-argument', INVITE_MSG.self);
  const job = await readJob(db, jobId);
  if (!job) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
  if (job.postedBy !== uid) throw new HttpsError('permission-denied', INVITE_MSG.notPoster);
  if (job.status !== 'open') throw new HttpsError('failed-precondition', INVITE_MSG.notOpen);
  if (!(await db.collection('users').doc(workerId).get()).exists) {
    throw new HttpsError('not-found', INVITE_MSG.workerNotFound);
  }
  const fromName = job.postedByName.trim() ? job.postedByName : FALLBACK_POSTER_NAME;
  const sent = await writeNotification(db, {
    userId: workerId,
    type: 'job_invite',
    message: messages.jobInvite(fromName, job.title),
    extras: { jobId, jobTitle: job.title, fromName },
    sourceId: `${jobId}_${workerId}`,
  });
  return { sent };
}
```

- [ ] **Step 4: Run handler tests to verify they pass**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/invites.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing callable wiring test**

`unijob-web/functions/tests/unit/callables/sendJobInvite.test.ts`:

```ts
import type { CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/invites.js', () => ({ handleSendJobInvite: vi.fn(async () => ({ sent: true })) }));

import { sendJobInvite } from '../../../src/callables/sendJobInvite.js';
import { handleSendJobInvite } from '../../../src/handlers/invites.js';

const request = (uid?: string, data: unknown = { jobId: 'j1', workerId: 'bob' }) =>
  ({ data, auth: uid ? { uid, token: {}, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => sendJobInvite.run(req));

describe('sendJobInvite', () => {
  it('is a callable in asia-southeast1', () => {
    expect(sendJobInvite.__endpoint.region).toEqual(['asia-southeast1']);
    expect(sendJobInvite.__endpoint.callableTrigger).toBeDefined();
  });
  it('passes the Admin db, the caller uid and the data', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ sent: true });
    expect(handleSendJobInvite).toHaveBeenCalledWith({ fake: 'db' }, 'alice', { jobId: 'j1', workerId: 'bob' });
  });
  it('rejects signed-out callers before touching data', async () => {
    vi.mocked(handleSendJobInvite).mockClear();
    await expect(call(request())).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(handleSendJobInvite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/callables/sendJobInvite.test.ts`
Expected: FAIL, cannot resolve `src/callables/sendJobInvite.js`.

- [ ] **Step 7: Implement the callable**

`unijob-web/functions/src/callables/sendJobInvite.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { REGION } from '../config.js';
import { handleSendJobInvite, type SendJobInviteResult } from '../handlers/invites.js';
import { requireAuth } from '../lib/auth.js';

export type { SendJobInviteResult } from '../handlers/invites.js';

export const sendJobInvite = onCall({ region: REGION }, (request): Promise<SendJobInviteResult> =>
  handleSendJobInvite(db, requireAuth(request), request.data),
);
```

- [ ] **Step 8: Write the emulator test**

`unijob-web/functions/tests/emulator/invites.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleSendJobInvite } from '../../src/handlers/invites.js';
import { connectEmulatorDb, notificationsFor } from '../support/emulatorDb.js';

let db: Firestore;
beforeAll(async () => {
  ({ db } = await connectEmulatorDb());
});

const uid = (p: string) => `${p}_${randomUUID()}`;

describe('sendJobInvite on the emulator', () => {
  it('creates exactly one job_invite per worker and job; a repeat returns sent: false', async () => {
    const poster = uid('alice');
    const worker = uid('bob');
    const jobId = uid('job');
    await db.doc(`users/${worker}`).set({ uid: worker, displayName: 'Bob' });
    await db.doc(`jobs/${jobId}`).set({ title: 'Nhập liệu', postedBy: poster, postedByName: 'Alice', status: 'open', applicants: [], assignedTo: [] });
    await expect(handleSendJobInvite(db, poster, { jobId, workerId: worker })).resolves.toEqual({ sent: true });
    await expect(handleSendJobInvite(db, poster, { jobId, workerId: worker })).resolves.toEqual({ sent: false });
    const docs = await notificationsFor(db, worker);
    expect(docs.map((d) => d.id)).toEqual([`job_invite_${jobId}_${worker}`]);
    expect(docs[0].data()).toMatchObject({ message: 'Alice mời bạn ứng tuyển "Nhập liệu"', fromName: 'Alice', jobId, source: 'server' });
  });

  it('a non-poster gets permission-denied and nothing is written', async () => {
    const worker = uid('bob');
    const jobId = uid('job');
    await db.doc(`users/${worker}`).set({ uid: worker });
    await db.doc(`jobs/${jobId}`).set({ title: 'T', postedBy: uid('alice'), status: 'open', applicants: [], assignedTo: [] });
    await expect(handleSendJobInvite(db, uid('mallory'), { jobId, workerId: worker })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await notificationsFor(db, worker)).toHaveLength(0);
  });
});
```

- [ ] **Step 9: Run unit and emulator tests**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/handlers/invites.test.ts tests/unit/callables/sendJobInvite.test.ts && npm run typecheck`
Then: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "cd functions && npx vitest run --project emulator tests/emulator/invites.emulator.test.ts"`
Expected: PASS.

- [ ] **Step 10: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS.

- [ ] **Step 11: Commit**

```bash
git add unijob-web/functions/src/handlers/invites.ts unijob-web/functions/src/callables/sendJobInvite.ts unijob-web/functions/tests/unit/handlers/invites.test.ts unijob-web/functions/tests/unit/callables/sendJobInvite.test.ts unijob-web/functions/tests/emulator/invites.emulator.test.ts
git commit -m "feat(functions): add sendJobInvite callable for poster invites [task:6]"
```

---

### Task 7: Export every function and document the deploy order

**Depends on Tasks 2 to 6.**

**Files:**
- Modify: `unijob-web/functions/src/index.ts`
- Modify: `unijob-web/functions/README.md`
- Test: `unijob-web/functions/tests/unit/index.test.ts`

**Interfaces:**
- Consumes: `onApplicationCreated`, `onApplicationUpdated` (Task 2), `onJobUpdated` (Task 3), `onJobCompletionWritten` (Task 4), `expireJobs` (Task 5), `sendJobInvite` (Task 6), existing `ping`.
- Produces: the deployable function set (names are the Cloud Functions names; 3b calls `sendJobInvite`).

- [ ] **Step 1: Write the failing test**

`unijob-web/functions/tests/unit/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as functions from '../../src/index.js';

type Endpoint = { region?: string[]; eventTrigger?: { eventFilters?: Record<string, string> } };

describe('functions entry point', () => {
  it('exports exactly the deployable functions', () => {
    expect(Object.keys(functions).sort()).toEqual(
      ['expireJobs', 'onApplicationCreated', 'onApplicationUpdated', 'onJobCompletionWritten', 'onJobUpdated', 'ping', 'sendJobInvite'].sort(),
    );
  });

  it('every function is in asia-southeast1 and every Firestore trigger targets kirigitejkf8095h', () => {
    for (const [name, fn] of Object.entries(functions)) {
      const endpoint = (fn as { __endpoint: Endpoint }).__endpoint;
      expect(endpoint.region, name).toEqual(['asia-southeast1']);
      if (endpoint.eventTrigger) expect(endpoint.eventTrigger.eventFilters?.database, name).toBe('kirigitejkf8095h');
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web/functions && npx vitest run --project unit tests/unit/index.test.ts`
Expected: FAIL, keys are only `['ping']`.

- [ ] **Step 3: Implement**

`unijob-web/functions/src/index.ts`:

```ts
export { ping } from './ping.js';
export { onApplicationCreated, onApplicationUpdated } from './triggers/applications.js';
export { onJobUpdated } from './triggers/jobs.js';
export { onJobCompletionWritten } from './triggers/completions.js';
export { expireJobs } from './scheduled/expireJobs.js';
export { sendJobInvite } from './callables/sendJobInvite.js';
```

In `unijob-web/functions/README.md`, after the `src/lib/` bullet, add:

```markdown
- `src/handlers/`: pure handlers `(db, ids, data)`; they never import `src/admin.ts`, so emulator tests can call them with the guarded emulator db.
- `src/triggers/`, `src/scheduled/`, `src/callables/`: thin v2 wrappers that bind a handler to an event and pass the Admin `db`.

## Notifications (slice 3)

| Function | Event | Notification (recipient) |
|---|---|---|
| `onApplicationCreated` | `applications/{appId}` created | `new_application` (poster) |
| `onApplicationUpdated` | application `pending` -> `accepted`/`rejected` | `application_accepted` / `application_rejected` (applicant) |
| `onJobCompletionWritten` | worker confirmed, poster not yet | `completion_requested` (poster), one per job |
| `onJobUpdated` | job status -> `cancelled` / `completed` | `job_cancelled` (assigned workers) / `job_completed` (worker and poster) |
| `expireJobs` | every 30 min, Asia/Ho_Chi_Minh | cancels overdue open jobs, `deadline_expired` (poster) |
| `sendJobInvite` | callable `{ jobId, workerId }` -> `{ sent }` | `job_invite` (worker) |
```

And replace the last bullet of "Deploying functions" with:

```markdown
- When a PR moves a write server-side and tightens the rules, deploy the functions first, then the rules (`npx firebase deploy --only firestore:rules`). Otherwise the client loses the write before the server can make it.
- Slice 3 order: `npx firebase deploy --only firestore:indexes` (index `jobs(status, deadline)` for `expireJobs`; wait until it is built), then `--only functions`, then right after that `--only hosting,firestore:rules` from the 3b branch. Between the functions and hosting deploys users may see a duplicate notification (old client + server); never deploy the 3b rules before these functions, or notifications stop.
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd unijob-web/functions && npx vitest run --project unit && npm run typecheck && npm run build`
Expected: PASS (all unit tests including the existing `ping.test.ts`), `lib/` emitted.

- [ ] **Step 5: Local CI**

Run: `cd . && node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (full runs every emulator test and the coverage gate over the whole branch).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/functions/src/index.ts unijob-web/functions/README.md unijob-web/functions/tests/unit/index.test.ts
git commit -m "feat(functions): export notification triggers, scheduler and invite callable [task:7]"
```

---

## Self-review notes

- Spec slice 3 coverage: new application, accepted/rejected, completion requested, completion confirmed (via job status, Decision 2), job cancelled, scheduled expiry replacing `cleanup.service.ts`, plus `job_invite`. Client removal, rules and the KNOWN HOLE flip are plan 3b. Worker cancellation is deferred to slice 6 (Decision 4).
- Type names are consistent across tasks: `JobInfo`, `readJob`, `toJobInfo`, `isDocId`, `messages.*`, `handle*` handlers, `SendJobInviteResult`, `ExpireOptions`/`ExpireResult`.
- PR body must state: deploy needs Blaze; order indexes, functions, then 3b; duplicate-notification window; no per-poster invite rate limit yet.
