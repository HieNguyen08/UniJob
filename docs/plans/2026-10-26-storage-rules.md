---
status: approved
approved: 2026-10-26 by HieNguyen08 in chat ("tiếp tục" — autonomous slices)
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/storage-rules
base: main
slice: 7 (spec section 3, slice 7 "storage rules")
---

# Storage rules for job attachments (slice 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firebase Storage gets a rules file that denies everything except job attachments. Only the job's poster can upload them, only while the job is `open`, and only files the client already accepts (size, content type, name length). Any signed-in user can read them; nobody can overwrite them; only the poster can delete them. The rules are tested on the Storage emulator in CI. `jobs.attachments` in Firestore becomes a list of at most 10 strings.

**Architecture:** The new `unijob-web/storage.rules` matches only `jobs/{jobId}/attachments/{fileName}`. This is the one path `storage.service.ts` writes (`CreateJob.tsx` creates the job, uploads, then sets `jobs.attachments`). The rules read the job with a cross-service `firestore.get(/databases/kirigitejkf8095h/documents/jobs/$(jobId))` against the named database. Tests use `@firebase/rules-unit-testing` on the Storage emulator and seed job docs into the named database with the Admin SDK on the Firestore emulator. Task 1 starts with a spike that proves the emulator really evaluates that cross-service read against `kirigitejkf8095h`. If it does not, the plan switches to the fallback below.

**Tech Stack:** Firebase Storage rules v2, `@firebase/rules-unit-testing` 5 (`storage()` compat API), `firebase-admin` 14 (already a web devDependency) for seeding, Firestore and Storage emulators (`demo-unijob`), Vitest `rules` and `unit` projects, `node:test` for tooling.

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (section 3, slice 7; testing rules in section 5).

All `Run:` lines are relative to the worktree root. `<EMULATOR_CONFIG>` is the emulator `firebase.json` the orchestrator supplies for this worktree. From Task 1 on, it must also have `"storage": { "rules": "<path to this worktree>/unijob-web/storage.rules" }` and an `emulators.storage.port` block, otherwise the Storage emulator refuses to start.

## Global Constraints

- Firestore database id: `kirigitejkf8095h`. Emulator project id: always `demo-unijob`.
- Client limits to mirror exactly (`unijob-web/src/services/storage.service.ts`): max size `10 * 1024 * 1024` bytes inclusive (the client rejects only `> 10 MB`). Allowed content types, exactly: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `application/zip`, `application/x-zip-compressed`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Object name: `jobs/{jobId}/attachments/${Date.now()}_${file.name}`. The rules cap `fileName` at 200 characters. The prefix is 14 characters (13 digits plus `_`).
- `jobs.attachments`: a list of at most 10 strings. The URLs are not bound to this job's storage path (backlog).
- Never weaken a test or a rule to get green. New rules tests go in `unijob-web/tests/rules/`, unit tests in `unijob-web/tests/unit/` (mirroring `src/`), tooling tests in `tests/tooling/`.
- UI copy is Vietnamese. Services own Storage/Firestore access; pages stay thin.
- `storage.service.ts` stays in `ci/coverage-legacy.json`, but Task 3 adds unit tests for every function it touches.
- Conventional Commits, message ends `[task:N]`, no `Co-Authored-By`. Commit only after `node scripts/ci-local.mjs --quick` is green on the exact tree. Task 4 (last) also runs `node scripts/ci-local.mjs --full` (needs Java 11 or later).
- Do not change `unijob-web/functions/**`.

## Deploy (goes in the PR body)

1. `cd unijob-web && npx firebase deploy --only storage`. The first deploy of rules that call `firestore.get` makes the Firebase console (or CLI) ask to grant the Storage service agent the role it needs to read Firestore (`roles/firebaserules.firestoreServiceAgent`). Accept it. Without it, every upload is denied.
2. `npx firebase deploy --only firestore:rules` and `npm run build && npx firebase deploy --only hosting` together (the client cap of 10 attachments ships with the rule that enforces it).
3. Smoke test in production: as a poster, create a job with one PDF attachment. It must upload and appear on the job page. A 403 on upload means the IAM role is missing, or production does not support cross-service reads of a named database. In that case roll back with `--only storage` from `main`, and switch to the fallback.

## Decisions

1. **Cross-service read, not custom metadata.** Custom metadata (`jobId`, `postedBy`) is client-written and proves nothing. `firestore.get` on the job is the only check that binds an upload to the real poster and the `open` status.
2. **`get` for signed-in users, `list` denied.** The app never lists a job's attachments. Listing would let anyone enumerate every upload.
3. **`<= 10 MB`, not `< 10 MB`.** This matches `validateFile`, so the rules never reject a file the client accepted.
4. **The client gets the same caps (Task 3).** It enforces at most 10 attachments and a file name of at most `MAX_FILE_NAME_LENGTH = 100` characters, so a user sees a Vietnamese message instead of a raw 403. A drift test ties `storage.rules` to `storage.service.ts`.
5. **Seeding the named database with `firebase-admin`.** `firestore.rules.test.ts` seeds through `withSecurityRulesDisabled`, which always writes `(default)`. Storage rules read `kirigitejkf8095h`, so this test seeds with `getFirestore(app, 'kirigitejkf8095h')` on the emulator, behind an env guard that refuses to run without `FIRESTORE_EMULATOR_HOST`.
6. **`jobs.attachments` is checked on create always, on update only when it changes.** That way a legacy job with more than 10 attachments can still be edited.

### Fallback F (only if the Task 1 spike fails)

Use this only if the Storage emulator cannot evaluate `firestore.get` against `kirigitejkf8095h`. Two signs: the poster is denied even though the job was seeded, or the "named database, not (default)" test lets `mallory` upload. Also use it if production fails the smoke test above. We do not ship a rule we cannot test. Switch to an owner-bound path:

- Rules: `match /jobs/{jobId}/attachments/{ownerUid}/{fileName}`. `create` requires `request.auth.uid == ownerUid` plus the same size, content-type and name checks. `get` for signed-in users, `list`/`update` false, `delete` only when `request.auth.uid == ownerUid`. Legacy `jobs/{jobId}/attachments/{fileName}`: `get` for signed-in users, no writes.
- `uploadJobAttachment(jobId: string, file: File, uid: string)` writes `jobs/${jobId}/attachments/${uid}/${Date.now()}_${file.name}`, and `CreateJob.tsx` passes `userProfile.uid`.
- Tests: replace the poster/non-poster/status cases with owner-segment cases (owner allowed; another uid's segment denied; signed out denied). Drop the named-database test.
- Backlog: "Storage uploads are bound to the uploader, not to the job's poster or its `open` status (cross-service rules on the named database could not be tested). Revisit when the emulator supports it."
- Say so in the Task 1 commit body and the PR body.

## File Structure

| File | Change | Task |
|---|---|---|
| `unijob-web/storage.rules` (create) | default deny; job attachment rules | 1 |
| `unijob-web/firebase.json` | `storage.rules`, Storage emulator port 9199 | 1 |
| `unijob-web/tests/rules/storage.rules.test.ts` (create) | Storage emulator tests | 1 |
| `unijob-web/package.json` (`test:rules`), `scripts/ci-local.mjs` (`rules-tests`) | `--only firestore,storage` | 2 |
| `tests/tooling/ci/rules-gate.test.mjs` (create) | pins both commands | 2 |
| `unijob-web/src/services/storage.service.ts`, `unijob-web/src/pages/CreateJob.tsx` | exported limits, name length, 10-file cap | 3 |
| `unijob-web/tests/unit/services/storage.service.test.ts` (create) | validation, path, drift against `storage.rules` | 3 |
| `unijob-web/firestore.rules`, `unijob-web/tests/rules/firestore.rules.test.ts` | `jobs.attachments` ≤ 10 strings | 4 |
| `docs/backlog/security-holes.md`, `CHANGELOG.md`, `unijob-web/README.md` | backlog, Vietnamese entry, deploy note | 4 |

## Parallelism

- **Task 1** goes first: Tasks 2 and 3 need `storage.rules` and the Storage emulator config.
- **Tasks 2 and 3** touch disjoint files and can run in parallel after Task 1.
- **Task 4**: its Firestore part is independent of Tasks 1 to 3. Its docs describe the whole slice and it runs `--full`, so run it last.

## Review Focus

1. **The emulator silently reads `(default)`.** If the Storage emulator resolved `firestore.get` against `(default)`, every test would pass while production reads a different database. Pinned by the split-document test in Task 1: the same job id has different posters in the two databases.
2. **The client accepts a file the rules reject.** Examples: a `.zip` with `application/x-zip-compressed` on Windows, a file of exactly 10 MB, a long Vietnamese file name. The user would get a raw error after the job was already created. Pinned by the allowed-types loop, the exact-10 MB case and the 100 × `ệ` name in Task 1, and by the drift test in Task 3.
3. **SVG or HTML uploads.** They would be stored XSS served from the Storage domain. Pinned by the content-type denial test in Task 1 (`image/svg+xml`, `text/html`, `application/octet-stream`, no content type).
4. **More than 10 files selected.** Every upload succeeds, then `updateJob({ attachments })` is denied by the Task 4 rule, leaving orphan objects and a job without attachments. Pinned by `attachmentLimitError` in Task 3 (the picker refuses the 11th file).
5. **Overwrite and job state.** Re-uploading to an existing object name or calling `updateMetadata` must be denied (`update: false`), as must uploading to a job that is `in-progress`, `cancelled`, `completed` or missing. Pinned in Task 1. A legacy job with more than 10 attachments must still be editable. Pinned in Task 4.

---

### Task 1: `storage.rules` for job attachments, tested on the Storage emulator (spike first)

**Files:**
- Create: `unijob-web/storage.rules`
- Modify: `unijob-web/firebase.json` (add top-level `"storage": { "rules": "storage.rules" }`; `emulators.storage: { "port": 9199 }`; keep everything else, including `singleProjectMode`)
- Test (create): `unijob-web/tests/rules/storage.rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `unijob-web/storage.rules`, read by Task 3's drift test. It must contain one literal list `request.resource.contentType in [ ... ]`, the expression `request.resource.size <= 10 * 1024 * 1024` and the expression `fileName.size() <= 200`. Also the Storage emulator in `firebase.json`.

- [ ] **Step 1: Spike — prove cross-service reads hit the named database**

Add the `firebase.json` changes. Write `storage.rules` with only the `create` rule from Step 4 (the rest stays denied). Write the test file skeleton:

- Guard in `beforeAll`: throw `run under firebase emulators:exec --only firestore,storage` unless both `FIRESTORE_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST` are set.
- `env = await initializeTestEnvironment({ projectId: 'demo-unijob', storage: { rules: readFileSync(join(process.cwd(), 'storage.rules'), 'utf8') } })`.
- Admin app: `initializeApp({ projectId: 'demo-unijob' }, 'storage-rules-seed')`; `named = getFirestore(adminApp, 'kirigitejkf8095h')`; `fallbackDb = getFirestore(adminApp)` (the `(default)` database).
- `afterAll`: `env.cleanup()`, `named.recursiveDelete(named.collection('jobs'))`, `fallbackDb.recursiveDelete(fallbackDb.collection('jobs'))`, `deleteApp(adminApp)`.
- `beforeEach`: `env.clearStorage()`, then `set()` (overwrite) into `named`: `jobs/open1 { postedBy: 'poster', status: 'open' }`, `jobs/busy { postedBy: 'poster', status: 'in-progress' }`, `jobs/gone { postedBy: 'poster', status: 'cancelled' }`, `jobs/done { postedBy: 'poster', status: 'completed' }`, `jobs/split { postedBy: 'poster', status: 'open' }`. Into `fallbackDb`: `jobs/split { postedBy: 'mallory', status: 'open' }` and `jobs/defaultOnly { postedBy: 'mallory', status: 'open' }`.
- Helpers: `st(uid?)` returns `env.authenticatedContext(uid).storage()`, or `env.unauthenticatedContext().storage()` without a uid. `att(jobId, name = '1761400000000_cv.pdf')` returns `jobs/${jobId}/attachments/${name}`. `put(uid, path, size = 16, contentType?: string)` returns `st(uid).ref(path).put(new Uint8Array(size), contentType ? { contentType } : undefined).then(() => undefined)`. `seedFile(path)` uploads a 16-byte PDF through `env.withSecurityRulesDisabled`.

The spike tests (they stay in the file):

```ts
it('the poster uploads a PDF to their own open job', async () => {
  await assertSucceeds(put('poster', att('open1'), 16, 'application/pdf'));
});
it('reads the job from the named database kirigitejkf8095h, not (default)', async () => {
  await assertSucceeds(put('poster', att('split'), 16, 'application/pdf'));
  await assertFails(put('mallory', att('split', '1761400000000_b.pdf'), 16, 'application/pdf'));
  await assertFails(put('mallory', att('defaultOnly'), 16, 'application/pdf'));
});
```

Run: `cd unijob-web && npx firebase emulators:exec --only firestore,storage --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules tests/rules/storage.rules.test.ts"`
Expected: both PASS. If the poster is denied, check the emulator output for the `firestore.get` error. Then try once with the path pointing at `(default)` and the job seeded there:
- If that passes, the emulator does not support named databases. Apply **Fallback F** and continue from Step 2 with its tests.
- If `mallory` is allowed on `split`, the emulator reads `(default)`. Apply **Fallback F**.
- A startup error about missing storage rules is a config problem (`<EMULATOR_CONFIG>`), not a fallback case.

- [ ] **Step 2: Write the remaining tests**

`ALLOWED` is the 11 content types from Global Constraints, as a literal in the test (do not import `storage.service.ts`: it initialises the client SDK). `MB = 1024 * 1024`.

```ts
it('the poster uploads every allowed content type', async () => {
  for (const [i, type] of ALLOWED.entries()) await assertSucceeds(put('poster', att('open1', `176140000000${i % 10}_f${i}`), 16, type));
});
it('non-posters and signed-out users cannot upload', async () => {
  await assertFails(put('mallory', att('open1'), 16, 'application/pdf'));
  await assertFails(put(undefined, att('open1'), 16, 'application/pdf'));
  await assertSucceeds(put('poster', att('open1'), 16, 'application/pdf')); // sanity
});
it('size: exactly 10 MB passes, one byte more is denied', async () => {
  await assertSucceeds(put('poster', att('open1', '1761400000000_max.pdf'), 10 * MB, 'application/pdf'));
  await assertFails(put('poster', att('open1', '1761400000000_big.pdf'), 10 * MB + 1, 'application/pdf'));
});
it('content types outside the client allowlist are denied', async () => {
  for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', 'application/x-msdownload']) {
    await assertFails(put('poster', att('open1', `1761400000000_x.${type.length}`), 16, type));
  }
  await assertFails(put('poster', att('open1', '1761400000000_none'), 16));
});
it('uploads need the job to be open and to exist', async () => {
  for (const jobId of ['busy', 'gone', 'done', 'missing']) await assertFails(put('poster', att(jobId), 16, 'application/pdf'));
});
it('file names up to 200 characters pass (including the longest Vietnamese name the client allows)', async () => {
  await assertSucceeds(put('poster', att('open1', '1'.repeat(200)), 16, 'application/pdf'));
  await assertFails(put('poster', att('open1', '1'.repeat(201)), 16, 'application/pdf'));
  await assertSucceeds(put('poster', att('open1', `1761400000000_${'ệ'.repeat(100)}`), 16, 'application/pdf'));
});
it('nested paths under attachments and other paths are denied', async () => {
  for (const p of ['jobs/open1/attachments/a/b.pdf', 'jobs/open1/x.pdf', 'jobs/open1/other/x.pdf', 'users/poster/a.pdf', 'a.pdf']) {
    await assertFails(put('poster', p, 16, 'application/pdf'));
    await assertFails(st('poster').ref(p).getMetadata());
  }
});
it('nobody overwrites an attachment or changes its metadata', async () => {
  await seedFile(att('open1'));
  await assertFails(put('poster', att('open1'), 16, 'application/pdf'));
  await assertFails(st('poster').ref(att('open1')).updateMetadata({ contentType: 'text/html' }));
});
it('signed-in users get attachments and their download URL; signed-out cannot; nobody lists', async () => {
  await seedFile(att('busy'));
  await assertSucceeds(st('mallory').ref(att('busy')).getDownloadURL());
  await assertSucceeds(st('mallory').ref(att('busy')).getMetadata());
  await assertFails(st(undefined).ref(att('busy')).getDownloadURL());
  await assertFails(st('poster').ref('jobs/busy/attachments').listAll());
});
it('only the poster deletes an attachment', async () => {
  await seedFile(att('busy'));
  await assertFails(st('mallory').ref(att('busy')).delete());
  await assertFails(st(undefined).ref(att('busy')).delete());
  await assertSucceeds(st('poster').ref(att('busy')).delete());
});
```

If the Vietnamese-name case fails while the 200 × `1` case passes, rules `size()` counts bytes. Lower `MAX_FILE_NAME_LENGTH` to 60 in Task 3 (14 + 60 × 3 ≤ 200), change `'ệ'.repeat(100)` to `'ệ'.repeat(60)`, and note it in the commit body. Never raise the 200 cap.

- [ ] **Step 3: Run to verify the new tests fail**

Run: the Step 1 command.
Expected: FAIL in the get, delete, list and other-path tests that need `get`/`delete` rules (denied while only `create` exists). The `put` denial tests already pass.

- [ ] **Step 4: Write the full `storage.rules`**

- `rules_version = '2'; service firebase.storage { match /b/{bucket}/o { … } }`. No catch-all match, so every other path is denied.
- Helper `isAuth()`.
- Helper `posterOf(jobId)`: `let job = firestore.get(/databases/kirigitejkf8095h/documents/jobs/$(jobId)); return isAuth() && job != null && job.data.postedBy == request.auth.uid;`.
- `match /jobs/{jobId}/attachments/{fileName}`:
  - `allow get: if isAuth();`
  - `allow list: if false;`
  - `allow create:` checks the cheap conditions first: `fileName.size() <= 200 && request.resource.size <= 10 * 1024 * 1024 && request.resource.contentType in [ …11 types… ]`, then `posterOf(jobId) && firestore.get(…same path…).data.status == 'open'`.
  - `allow update: if false;`
  - `allow delete: if posterOf(jobId);`
- Vietnamese comments, e.g. `// Tệp đính kèm job: chỉ người đăng tải lên khi job còn 'open'; giới hạn khớp storage.service.ts (10MB, danh sách contentType).` and `// Đọc job ở database có tên kirigitejkf8095h (không phải (default)).`

- [ ] **Step 5: Run to verify pass**

Run: the Step 1 command, then `cd unijob-web && npx firebase emulators:exec --only firestore,storage --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`.
Expected: all PASS, including `firestore.rules.test.ts` with both emulators up.

- [ ] **Step 6: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS (`firebase.json` changed, so the functions unit gate runs).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/storage.rules unijob-web/firebase.json unijob-web/tests/rules/storage.rules.test.ts
git commit -m "feat(storage): add storage rules for job attachments [task:1]"
```

---

### Task 2: Rules tests run on the Firestore and Storage emulators in CI

**Depends on Task 1.**

**Files:**
- Modify: `unijob-web/package.json:15` (`test:rules`)
- Modify: `scripts/ci-local.mjs:125` (`rules-tests` gate)
- Test (create): `tests/tooling/ci/rules-gate.test.mjs`

**Interfaces:**
- Consumes: the Storage emulator in `unijob-web/firebase.json` (Task 1).
- Produces: `npm run test:rules` and `ci-local --full` run `tests/rules/**` with both emulators. GitHub Actions runs `ci-local --full` (`.github/workflows/ci.yml`), so it needs no change.

- [ ] **Step 1: Write the failing test**

`tests/tooling/ci/rules-gate.test.mjs`, in the style of `ci-workflow.test.mjs`:

```js
const ci = readFileSync(new URL('../../../scripts/ci-local.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../../unijob-web/package.json', import.meta.url), 'utf8'));
const RULES_CMD = /firebase emulators:exec --only firestore,storage --project demo-unijob "(npx )?vitest run --project rules"/;

test('ci-local rules-tests starts the Firestore and Storage emulators', () => {
  assert.match(ci, RULES_CMD);
});
test('npm run test:rules starts the Firestore and Storage emulators', () => {
  assert.match(pkg.scripts['test:rules'], RULES_CMD);
});
test('functions tests keep their own emulators', () => {
  assert.match(pkg.scripts['test:functions'], /--only firestore,auth /);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/tooling/ci/rules-gate.test.mjs`
Expected: FAIL in the first two tests; the third passes.

- [ ] **Step 3: Implement**

Change `--only firestore` to `--only firestore,storage` in `test:rules` and in the `rules-tests` gate command. Nothing else.

- [ ] **Step 4: Run to verify pass**

Run: `node --test "tests/tooling/**/*.test.mjs" && cd unijob-web && npm run test:rules`
Expected: PASS (`test:rules` uses the repo `firebase.json`; if the repo emulator ports clash with another worktree, run Task 1 Step 5's command with `<EMULATOR_CONFIG>` instead).

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS (`tooling-tests` runs).

- [ ] **Step 6: Commit**

```bash
git add unijob-web/package.json scripts/ci-local.mjs tests/tooling/ci/rules-gate.test.mjs
git commit -m "ci(rules): run rules tests on the firestore and storage emulators [task:2]"
```

---

### Task 3: Client limits match the Storage rules

**Depends on Task 1** (the drift test reads `storage.rules`).

**Files:**
- Modify: `unijob-web/src/services/storage.service.ts:4-37`
- Modify: `unijob-web/src/pages/CreateJob.tsx:72-80` (file picker handler), `:121-126` (submit guard)
- Test (create): `unijob-web/tests/unit/services/storage.service.test.ts`

**Interfaces:**
- Consumes: `unijob-web/storage.rules` (Task 1) as text.
- Produces, from `storage.service.ts`:
  - `ALLOWED_TYPES: readonly string[]` (same 11 values, now exported)
  - `MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024`
  - `MAX_FILE_NAME_LENGTH = 100`
  - `MAX_ATTACHMENTS = 10`
  - `validateFile(file: File): string | null` (adds the name check)
  - `attachmentLimitError(current: number, adding: number): string | null`
  - `uploadJobAttachment(jobId, file)`, which now passes `{ contentType: file.type }` to `uploadBytes`.
  - Under Fallback F, `uploadJobAttachment` takes a third `uid` argument (see the fallback).

- [ ] **Step 1: Write the failing test**

Mock `firebase/storage` (`ref` returns `{ fullPath: path }`; `uploadBytes`, `getDownloadURL` resolve) and `@/lib/firebase` (`{ storage: 'STORAGE' }`). `const file = (name: string, size: number, type: string) => ({ name, size, type }) as File;`.

```ts
describe('validateFile', () => {
  it('accepts exactly 10 MB and rejects one byte more', () => {
    expect(validateFile(file('a.pdf', MAX_FILE_SIZE_BYTES, 'application/pdf'))).toBeNull();
    expect(validateFile(file('a.pdf', MAX_FILE_SIZE_BYTES + 1, 'application/pdf'))).toBe('File "a.pdf" vượt quá 10MB');
  });
  it('rejects types outside the allowlist (svg, html, empty)', () => {
    for (const t of ['image/svg+xml', 'text/html', '']) expect(validateFile(file('a', 1, t))).toBe('File "a" không được hỗ trợ');
  });
  it('rejects names longer than MAX_FILE_NAME_LENGTH, accepts a 100-character Vietnamese name', () => {
    expect(validateFile(file('ệ'.repeat(100), 1, 'application/pdf'))).toBeNull();
    expect(validateFile(file('a'.repeat(101), 1, 'application/pdf'))).toBe(`Tên file quá dài (tối đa ${MAX_FILE_NAME_LENGTH} ký tự)`);
  });
});
describe('attachmentLimitError', () => {
  it('allows up to 10 files and refuses the 11th', () => {
    expect(attachmentLimitError(0, 10)).toBeNull();
    expect(attachmentLimitError(9, 1)).toBeNull();
    expect(attachmentLimitError(10, 1)).toBe('Chỉ được đính kèm tối đa 10 file');
    expect(attachmentLimitError(3, 8)).toBe('Chỉ được đính kèm tối đa 10 file');
  });
});
describe('uploadJobAttachment', () => {
  it('writes jobs/{jobId}/attachments/{13 digits}_{name} with the file content type', async () => {
    const f = file('cv.pdf', 5, 'application/pdf');
    await uploadJobAttachment('j1', f);
    expect(ref).toHaveBeenCalledWith('STORAGE', expect.stringMatching(/^jobs\/j1\/attachments\/\d{13}_cv\.pdf$/));
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), f, { contentType: 'application/pdf' });
  });
});
describe('storage.rules stays in sync with the client limits', () => {
  const rules = readFileSync(join(process.cwd(), 'storage.rules'), 'utf8');
  it('allows exactly ALLOWED_TYPES', () => {
    const list = rules.match(/request\.resource\.contentType in \[([^\]]*)\]/)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...ALLOWED_TYPES].sort());
  });
  it('caps size at MAX_FILE_SIZE_BYTES and names at 200 (prefix + MAX_FILE_NAME_LENGTH fits)', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(rules).toContain('request.resource.size <= 10 * 1024 * 1024');
    expect(rules).toContain('fileName.size() <= 200');
    expect(14 + MAX_FILE_NAME_LENGTH).toBeLessThanOrEqual(200);
  });
});
```

(If Task 1 lowered `MAX_FILE_NAME_LENGTH` to 60, use 60 in the Vietnamese case.)

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx vitest run --project unit tests/unit/services/storage.service.test.ts`
Expected: FAIL. The new exports are missing, the name check is absent, and `uploadBytes` is called without metadata.

- [ ] **Step 3: Implement**

- `storage.service.ts`:
  - Export the constants listed in Interfaces. Keep `validateFile`'s size and type messages as they are, and add the name check last.
  - Add `attachmentLimitError`.
  - `uploadBytes(fileRef, file, { contentType: file.type })`.
  - Comment above the constants: `// Phải khớp storage.rules (test: tests/unit/services/storage.service.test.ts).`
- `CreateJob.tsx` file picker: before validating each file, refuse with `toast.error(attachmentLimitError(...))` once `attachmentFiles.length + accepted` would exceed `MAX_ATTACHMENTS`. Keep the files accepted so far.
- `CreateJob.tsx` `handleSubmit`: the same guard before `createJob`, with `return` (defence against state races).

- [ ] **Step 4: Run to verify pass**

Run: `cd unijob-web && npx vitest run --project unit && npx tsc -b && npx eslint src/services/storage.service.ts src/pages/CreateJob.tsx tests/unit/services/storage.service.test.ts`
Expected: PASS, clean.

- [ ] **Step 5: Local CI**

Run: `node scripts/ci-local.mjs --quick`
Expected: all gates PASS.

- [ ] **Step 6: Commit**

```bash
git add unijob-web/src/services/storage.service.ts unijob-web/src/pages/CreateJob.tsx unijob-web/tests/unit/services/storage.service.test.ts
git commit -m "feat(storage): enforce attachment limits on the client to match the rules [task:3]"
```

---

### Task 4: `jobs.attachments` is at most 10 strings; backlog, CHANGELOG, deploy note

**Firestore part independent of Tasks 1 to 3; run last** (its docs describe the whole slice, and it runs `--full`).

**Files:**
- Modify: `unijob-web/firestore.rules:91-155` (jobs create/update)
- Modify: `unijob-web/tests/rules/firestore.rules.test.ts` (inside `describe('jobs')`, after the test at line 627)
- Modify: `docs/backlog/security-holes.md`, `CHANGELOG.md`, `unijob-web/README.md:119-122`

**Interfaces:**
- Consumes: nothing from earlier tasks (the client cap `MAX_ATTACHMENTS = 10` from Task 3 mirrors this rule).
- Produces: `jobs.create` requires `attachments` (default `[]`) to be a list of at most 10 strings. A poster `update` that changes `attachments` requires the same.

- [ ] **Step 1: Write the failing tests**

```ts
it('attachments: a list of at most 10 strings on create', async () => {
  const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}.pdf`);
  await assertSucceeds(setDoc(doc(as('alice'), 'jobs/a10'), newJob('alice', { attachments: urls(10) })));
  await assertSucceeds(setDoc(doc(as('alice'), 'jobs/a0'), newJob('alice'))); // field absent
  await assertFails(setDoc(doc(as('alice'), 'jobs/a11'), newJob('alice', { attachments: urls(11) })));
  await assertFails(setDoc(doc(as('alice'), 'jobs/anum'), newJob('alice', { attachments: [...urls(9), 7] })));
  await assertFails(setDoc(doc(as('alice'), 'jobs/astr'), newJob('alice', { attachments: 'https://example.com/a.pdf' })));
  await assertFails(setDoc(doc(as('alice'), 'jobs/amap'), newJob('alice', { attachments: [{ url: 'x' }] })));
});
it('attachments: the poster update (updateJob after upload) must keep the same shape', async () => {
  const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}.pdf`);
  const j = doc(as('poster'), 'jobs/job1');
  await assertSucceeds(updateDoc(j, { attachments: urls(10), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(j, { attachments: urls(11), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(j, { attachments: [null], updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(j, { attachments: 'x', updatedAt: serverTimestamp() }));
});
it('a legacy job with more than 10 attachments can still be edited when attachments do not change', async () => {
  await seedJob('legacyAtt', { attachments: Array.from({ length: 12 }, (_, i) => `u${i}`) });
  await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/legacyAtt'), { title: 'Mới', updatedAt: serverTimestamp() }));
});
```

(Use the file's existing `seedJob` helper; check its signature and default `postedBy: 'poster'` before relying on it.)

- [ ] **Step 2: Run to verify failure**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore,storage --project demo-unijob --config <EMULATOR_CONFIG> "npx vitest run --project rules"`
Expected: FAIL in the `urls(11)`, number, string, map and `[null]` cases. The 10-item, absent-field and legacy cases pass.

- [ ] **Step 3: Implement**

- In `match /jobs/{jobId}`, add `function attachmentsOk(data)`. It takes `let a = data.get('attachments', []);` and returns `a is list && a.size() <= 10`, AND for each index 0 through 9 `(a.size() <= i || a[i] is string)`. Comment: `// tệp đính kèm: tối đa 10 chuỗi (URL tải xuống), khớp MAX_ATTACHMENTS ở storage.service.ts`.
- `allow create`: `&& attachmentsOk(request.resource.data)`.
- Poster branch of `allow update`: `&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['attachments']) || attachmentsOk(request.resource.data))`.

- [ ] **Step 4: Run to verify pass**

Run: the Step 2 command.
Expected: all PASS (both rules test files).

- [ ] **Step 5: Docs**

`docs/backlog/security-holes.md` "Not yet pinned by tests": replace the **No `storage.rules`** bullet with:
- `- **Attachment URLs not bound to the job** — \`jobs.attachments\` is checked as ≤ 10 strings only; a poster can store any URL (another job's file, an external link). Bind each entry to \`https://firebasestorage.googleapis.com/…/o/jobs%2F{jobId}%2Fattachments%2F…\` or store storage paths instead of URLs. Later slice.`
- `- **Download URLs are bearer links** — Storage \`get\` needs sign-in, but a \`getDownloadURL\` link (with its token) works for anyone who has it. Acceptable for job attachments; revisit before storing private files (CVs, IDs).`
- `- **Orphan attachments** — files stay in Storage when the job doc update fails after upload, when the poster removes the job, or when the 10-file cap trips; deleting a job does not delete its files (and after the job is gone nobody can, per the rules). Needs a server cleanup (job delete trigger or scheduled sweep).`

If Fallback F was used, add its backlog bullet as well.

`CHANGELOG.md` under `## [Unreleased]`, `### Security`:
`- Thêm \`storage.rules\`: chỉ người đăng tải tệp đính kèm lên job của mình khi job còn "open" (tối đa 10MB, đúng các định dạng ứng dụng cho phép, tên file ≤ 200 ký tự), ai đăng nhập cũng xem được, không ai ghi đè, chỉ người đăng xoá; mọi đường dẫn khác bị chặn. \`jobs.attachments\` tối đa 10 mục. Deploy: \`firebase deploy --only storage\` (chấp nhận cấp quyền đọc Firestore cho Storage khi được hỏi), rồi rules Firestore và hosting cùng lúc.`

`unijob-web/README.md` step 5, after the **Storage** line, add a sub-bullet:
`     - Deploy rules: \`npx firebase deploy --only storage\`. Lần đầu Firebase sẽ hỏi cấp quyền cho service agent của Storage đọc Firestore (rules dùng \`firestore.get\` trên database \`kirigitejkf8095h\`): chọn đồng ý, nếu không mọi lượt tải tệp đính kèm đều bị từ chối.`

- [ ] **Step 6: Local CI (full: whole branch before push)**

Run: `node scripts/ci-local.mjs --quick && node scripts/ci-local.mjs --full`
Expected: all gates PASS (`rules-tests` now runs both rules files on both emulators).

- [ ] **Step 7: Commit**

```bash
git add unijob-web/firestore.rules unijob-web/tests/rules/firestore.rules.test.ts docs/backlog/security-holes.md CHANGELOG.md unijob-web/README.md
git commit -m "fix(rules): limit job attachments to 10 strings and document the storage deploy [task:4]"
```

---

## Self-review notes

- Spec slice 7 coverage: owner-only paths, plus content-type and size limits matching `storage.service.ts` (Task 1, drift-checked in Task 3); tests on the Storage emulator (Task 1); `firebase.json` and the rules gate (Tasks 1 and 2). Beyond the spec: `jobs.attachments` shape (Task 4) and the client caps (Task 3), so the rules never reject what the UI accepted.
- Names are consistent: `MAX_ATTACHMENTS`, `MAX_FILE_NAME_LENGTH`, `MAX_FILE_SIZE_BYTES`, `ALLOWED_TYPES`, `attachmentLimitError` (Task 3); the rules literals `request.resource.size <= 10 * 1024 * 1024`, `fileName.size() <= 200` and `request.resource.contentType in [` (Task 1, read by Task 3).
- The named-database risk is found in Task 1 Step 1, before anything else is built, and again by the production smoke test. Fallback F is the documented path in both cases.
