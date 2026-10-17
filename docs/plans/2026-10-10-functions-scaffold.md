---
title: Cloud Functions scaffold (security hardening slice 2)
status: approved
approved: 2026-10-10 by HieNguyen08 in chat (autonomous slices: "tự phân rã task, tự đẩy")
spec: docs/specs/2026-10-10-security-hardening.md
branch: feat/functions-scaffold
---

# Slice 2: Cloud Functions scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested, CI-gated `unijob-web/functions/` package (Cloud Functions v2, TypeScript, Node 22) with an Admin SDK bound to the named database, shared helpers (auth, membership, idempotent notification writer, platform fee) and one `ping` callable. No business behaviour yet.

**Architecture:** `functions/` is its own npm package (ESM, `module: NodeNext`, build `src/` → `lib/`). It is deployed on its own, so it cannot import web-app code at runtime. `src/config.ts` holds `REGION` and `DATABASE_ID`. `src/admin.ts` owns the one Admin app and `db`. `src/lib/*` holds pure or db-injected helpers that slices 3–6 build on. Tests use Vitest with two projects: `unit` (no emulator, used by `--quick`) and `emulator` (Firestore emulator, used by `--full`). `ci-local` gets `functions-typecheck` and `functions-tests` gates, and the coverage gate merges the web and functions coverage summaries.

**Tech Stack:** firebase-functions (v2 API), firebase-admin, firebase-functions-test, TypeScript 5.9, Vitest (same version as the web app), Firebase emulators via `firebase-tools` from `unijob-web/node_modules`.

**Spec:** `docs/specs/2026-10-10-security-hardening.md` (slice 2; sections 2, 4, 5 and 6 apply).

All paths are relative to the worktree root. Commands that say `(in unijob-web/functions)` run with that directory as cwd. Each task ends with a green `node scripts/ci-local.mjs --quick` run from the worktree root, then one Conventional Commit whose subject ends in `[task:N]` and has no Co-Authored-By trailer.

## Global Constraints

- Runtime: Cloud Functions for Firebase v2, TypeScript, Node 22 (`engines.node: "22"`, firebase.json `runtime: "nodejs22"`), region `asia-southeast1`.
- Firestore: named database `kirigitejkf8095h`. The Admin SDK uses `getFirestore(app, 'kirigitejkf8095h')`. Later triggers pass `database: DATABASE_ID`.
- Emulator project id is always `demo-unijob`. Emulator ports: auth 9099, firestore 8080, functions 5001.
- Callables throw `HttpsError` with Vietnamese messages for user-facing errors (`unauthenticated`, `permission-denied`, `failed-precondition`, `not-found`).
- Side-effect docs use deterministic ids (notifications keyed by event). A duplicate event is a no-op.
- `firebase-functions`, `firebase-admin` and all functions devDependencies are pinned to exact versions (no `^`/`~`).
- New files under `unijob-web/functions/src/**` need ≥70% line coverage. Do not add them to `ci/coverage-legacy.json`.
- Never weaken tests, rules or CI thresholds. Never write `.env*` or service-account files. No deploy in this slice.
- UI and user-facing error copy is Vietnamese.

## Review Focus

1. **Two deliveries of the same event racing** (trigger retry while the first run is still writing): exactly one notification doc exists and exactly one call returns `true`. Pinned in Task 4 (`concurrent duplicates create exactly one notification`).
2. **Emulator tests started without the emulator** (someone runs `vitest run` in `functions/` with real credentials on the machine): the tests must refuse before touching any database. Pinned in Task 4 (`assertEmulatorEnv` + its unit tests).
3. **Bad event keys** (`''`, a key containing `/`, `.`/`..`, `__x__`, over 1500 bytes): a `/` would silently write into a subcollection path. These must throw before any write. Pinned in Task 4.
4. **Extras that carry `undefined` or collide with core fields** (a trigger passes `{ jobTitle: undefined }` or `{ userId: … }`): Admin SDK rejects `undefined`, and a colliding key must not redirect the notification. `undefined` values are dropped, only `jobId`/`jobTitle`/`fromName` are kept, and core fields win. Pinned in Task 4.
5. **Jobs without `assignedTo`** (open jobs, legacy docs) and **missing jobs** in `assertMember`: the poster is still recognised, everyone else gets `permission-denied`, and a missing job gets `not-found` instead of a TypeError. Pinned in Task 3.

## File map

| File | Responsibility | Task |
|---|---|---|
| `unijob-web/functions/package.json`, `package-lock.json` | Functions package, exact pins, scripts | 1 |
| `unijob-web/functions/tsconfig.json` | Build config `src` → `lib` | 1 |
| `unijob-web/functions/tsconfig.dev.json` | Typecheck src + tests (noEmit) | 1 |
| `unijob-web/functions/vitest.config.ts` | `unit` + `emulator` projects, coverage | 1 |
| `unijob-web/functions/src/config.ts` | `REGION`, `DATABASE_ID` | 1 |
| `unijob-web/functions/src/admin.ts` | Single Admin app, `db` bound to named database | 1 |
| `unijob-web/functions/README.md` | Layout, commands, "Deploying functions" | 1 |
| `unijob-web/firebase.json` | `functions` block, functions emulator 5001 | 1 |
| `unijob-web/eslint.config.js` | Node block for `functions/**`, ignore build output | 1 |
| `.gitignore` | `functions/lib`, `functions/coverage` | 1 |
| `scripts/ci/checks.mjs` | `functionsAffected`, `coveragePctByFile` | 2 |
| `scripts/ci-local.mjs` | New gates, merged coverage, functions audit | 2 |
| `unijob-web/package.json` | `test:functions` script | 2 |
| `.github/workflows/ci.yml` | `npm ci` in functions, cache both locks | 2 |
| `CLAUDE.md` | Layout + Commands lines | 2 |
| `unijob-web/functions/src/lib/types.ts` | `MemberRole`, `JobMembership`, `NotificationType` | 3, 4 |
| `unijob-web/functions/src/lib/auth.ts` | `requireAuth`, `assertMember` | 3 |
| `unijob-web/functions/src/ping.ts`, `src/index.ts` | `ping` callable, exports | 3 |
| `unijob-web/functions/src/lib/notifications.ts` | `writeNotification`, `assertValidEventKey` | 4 |
| `unijob-web/functions/tests/support/emulator.ts` | `assertEmulatorEnv` guard | 4 |
| `unijob-web/functions/src/lib/fees.ts` | Copy of `calculatePlatformFee` | 5 |

**Decision: platform fee is duplicated with a parity test, not shared.** Firebase uploads only the `functions/` directory to Cloud Build and runs `npm install` + `main` from there, so `lib/index.js` cannot import `../src/lib/fees.ts` at runtime. Sharing would need a bundler, or a `rootDir` above `functions/` that moves the entry to `lib/functions/src/index.js` and ships web code into the deploy. The function is 5 lines and pure. `functions/tests/unit/parity.test.ts` imports both copies and compares them over every tier boundary. `functionsAffected` treats a change to `unijob-web/src/lib/fees.ts` as a functions change, so the parity test runs in `--quick` whichever side changes. The `NotificationType` union gets the same treatment with a type-level parity test.

---

### Task 1: Scaffold the functions package, Admin SDK binding and emulator config

**Files:**
- Create: `unijob-web/functions/package.json`, `unijob-web/functions/package-lock.json` (generated by npm)
- Create: `unijob-web/functions/tsconfig.json`, `unijob-web/functions/tsconfig.dev.json`, `unijob-web/functions/vitest.config.ts`
- Create: `unijob-web/functions/src/config.ts`, `unijob-web/functions/src/admin.ts`
- Create: `unijob-web/functions/README.md`
- Modify: `unijob-web/firebase.json`, `unijob-web/eslint.config.js`, `.gitignore`
- Test: `unijob-web/functions/tests/unit/config.test.ts`, `unijob-web/functions/tests/unit/admin.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/config.ts`: `export const REGION = 'asia-southeast1'`, `export const DATABASE_ID = 'kirigitejkf8095h'` (both `as const`).
  - `src/admin.ts`: `export const app: App`, `export const db: Firestore` (from `firebase-admin/firestore`), re-exports `REGION`, `DATABASE_ID`.
  - npm scripts in `functions/`: `build`, `typecheck`, `test` (unit project), `test:ci` (all projects + coverage).
  - Vitest projects `unit` (`tests/unit/**/*.test.ts`) and `emulator` (`tests/emulator/**/*.test.ts`).

- [ ] **Step 1: Create the package and pin versions**

Pick the versions. Use the current latest of each on npm, pinned exactly. At the time of writing the expected majors are firebase-functions 7, firebase-admin 13 and firebase-functions-test 3. Use whatever `npm view` reports.

```powershell
npm view firebase-functions version
npm view firebase-admin version
npm view firebase-functions-test version peerDependencies
cd unijob-web; npm ls vitest @vitest/coverage-v8 typescript   # reuse the web app's exact installed versions
```

If the latest `firebase-functions-test` does not list the chosen `firebase-functions` major in its `peerDependencies`, stop and report. Do not use `--legacy-peer-deps`.

Create `unijob-web/functions/package.json`. Replace each `<…>` with the exact version from the commands above. Never leave a `^` or `~`.

```json
{
  "name": "unijob-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.dev.json",
    "test": "vitest run --project unit",
    "test:ci": "vitest run --coverage"
  },
  "dependencies": {
    "firebase-admin": "<exact>",
    "firebase-functions": "<exact>"
  },
  "devDependencies": {
    "@types/node": "<exact 22.x>",
    "@vitest/coverage-v8": "<same exact as web>",
    "firebase-functions-test": "<exact>",
    "typescript": "<same exact as web, 5.9.x>",
    "vitest": "<same exact as web>"
  }
}
```

Then generate the lockfile with `npm install` (in unijob-web/functions). On Node 24, npm prints an `EBADENGINE` warning for `engines.node: "22"`. That warning is expected and is not an error.

Run `npm audit --omit=dev --audit-level=high` (in unijob-web/functions). If it reports the `@grpc/grpc-js` advisory, add `"overrides": { "@grpc/grpc-js": "^1.14.5" }` the same way `unijob-web/package.json` does, re-run `npm install`, and confirm the audit is clean. Any other high advisory: stop and report.

- [ ] **Step 2: TypeScript and Vitest config**

`unijob-web/functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "outDir": "lib",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`unijob-web/functions/tsconfig.dev.json` sets `rootDir: ".."` and `allowImportingTsExtensions` because the parity tests (Task 5) import two dependency-free web files by their `.ts` path. Source files under `src/` always import each other with `.js` suffixes.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "..",
    "allowImportingTsExtensions": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`unijob-web/functions/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Never a real project: the Admin SDK reads this when no explicit projectId is given.
    env: { GCLOUD_PROJECT: 'demo-unijob' },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'emulator',
          include: ['tests/emulator/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
```

- [ ] **Step 3: Write the failing tests**

`unijob-web/functions/tests/unit/config.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATABASE_ID, REGION } from '../../src/config.js';

const firebaseJson = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

describe('functions config', () => {
  it('REGION is asia-southeast1', () => {
    expect(REGION).toBe('asia-southeast1');
  });

  it('firebase.json firestore database equals DATABASE_ID', () => {
    expect(firebaseJson.firestore.database).toBe(DATABASE_ID);
    expect(DATABASE_ID).toBe('kirigitejkf8095h');
  });

  it('firebase.json declares the functions source, nodejs22 runtime and a predeploy build', () => {
    expect(firebaseJson.functions).toMatchObject({ source: 'functions', runtime: 'nodejs22' });
    expect(firebaseJson.functions.predeploy.join(' ')).toContain('run build');
  });

  it('firebase.json emulators: functions 5001, auth 9099, firestore 8080', () => {
    expect(firebaseJson.emulators.functions.port).toBe(5001);
    expect(firebaseJson.emulators.auth.port).toBe(9099);
    expect(firebaseJson.emulators.firestore.port).toBe(8080);
  });

  it('package engines.node matches the firebase.json runtime', () => {
    expect(`nodejs${pkg.engines.node}`).toBe(firebaseJson.functions.runtime);
  });

  it('package main points at the build output', () => {
    expect(pkg.main).toBe('lib/index.js');
  });

  it('every dependency is pinned to an exact version', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
```

`unijob-web/functions/tests/unit/admin.test.ts`:

```ts
import { getApps } from 'firebase-admin/app';
import { describe, expect, it, vi } from 'vitest';

describe('admin', () => {
  it('binds db to the named database kirigitejkf8095h', async () => {
    const { db, DATABASE_ID } = await import('../../src/admin.js');
    expect(db.databaseId).toBe(DATABASE_ID);
    expect(db.databaseId).toBe('kirigitejkf8095h');
  });

  it('re-exports REGION', async () => {
    const { REGION } = await import('../../src/admin.js');
    expect(REGION).toBe('asia-southeast1');
  });

  it('re-importing after a module reset reuses the existing default app', async () => {
    await import('../../src/admin.js');
    vi.resetModules();
    const again = await import('../../src/admin.js');
    expect(getApps()).toHaveLength(1);
    expect(again.app).toBe(getApps()[0]);
  });
});
```

`db.databaseId` is a public getter on the Admin `Firestore` class. If the installed typings lack it, stop and report. Do not reach into private fields.

- [ ] **Step 4: Run the tests to verify they fail**

Run (in unijob-web/functions): `npx vitest run --project unit`
Expected: FAIL. The imports `../../src/config.js` and `../../src/admin.js` cannot be resolved, and `firebaseJson.functions` is undefined.

- [ ] **Step 5: Implement config, admin and firebase.json**

`unijob-web/functions/src/config.ts`:

```ts
/** Deploy region for every function. */
export const REGION = 'asia-southeast1' as const;
/** Named Firestore database (see unijob-web/firebase.json). Triggers must pass `database: DATABASE_ID`. */
export const DATABASE_ID = 'kirigitejkf8095h' as const;
```

`unijob-web/functions/src/admin.ts`:

```ts
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DATABASE_ID } from './config.js';

export { DATABASE_ID, REGION } from './config.js';

/** The one Admin app. Reused if already initialised (module reloads, tests). */
export const app: App = getApps()[0] ?? initializeApp();
/** Admin Firestore bound to the named database. Bypasses security rules: validate inputs first. */
export const db: Firestore = getFirestore(app, DATABASE_ID);
```

`unijob-web/firebase.json`: add a top-level `functions` block after `firestore`, and the functions emulator. Leave every other key unchanged:

```json
  "functions": {
    "source": "functions",
    "runtime": "nodejs22",
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"],
    "ignore": ["node_modules", ".git", "tests", "coverage", "*.log", "tsconfig.dev.json", "vitest.config.ts"]
  },
```

and in `emulators`: `"functions": { "port": 5001 },` between `firestore` and `ui`.

- [ ] **Step 6: Lint, gitignore, README**

`unijob-web/eslint.config.js`: keep the web block but stop it matching functions, and add a Node block. The resulting array:

```js
export default defineConfig([
  globalIgnores(['dist', 'functions/lib', 'functions/coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['functions/**'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['functions/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },
])
```

ESLint runs from `unijob-web/` with the web app's installed plugins, so the functions package needs no ESLint dependency. The existing `lint` gate already passes changed `functions/**/*.ts` files (quick) and covers them via `eslint .` (full).

`.gitignore`: under `# Agent pipeline` add:

```
unijob-web/functions/lib/
unijob-web/functions/coverage/
```

`unijob-web/functions/README.md`:

```markdown
# UniJob Cloud Functions

Cloud Functions for Firebase v2 (TypeScript, Node 22, region `asia-southeast1`). Every trusted write (money, escrow, completion, work history, reputation, notifications to other users) belongs here, not in the web client.

- `src/config.ts`: `REGION`, `DATABASE_ID` (`kirigitejkf8095h`).
- `src/admin.ts`: the Admin app and `db` bound to the named database. Firestore triggers must pass `database: DATABASE_ID`.
- `src/lib/`: shared helpers (`requireAuth`, `assertMember`, `writeNotification`, `calculatePlatformFee`).
- `tests/unit/`: Vitest, no emulator (`npm test`).
- `tests/emulator/`: Vitest against the Firestore emulator. Run from `unijob-web/` with `npm run test:functions` (needs Java ≥ 11). Project is always `demo-unijob`.

Install: `npm ci` here as well as in `unijob-web/`.

## Deploying functions

- Deploying needs the Blaze (pay-as-you-go) plan on the Firebase project. The owner does this. PRs only add code and tests.
- From `unijob-web/`: `npx firebase deploy --only functions` (the predeploy step runs `npm run build`).
- When a PR moves a write server-side and tightens the rules, deploy the functions first, then the rules (`npx firebase deploy --only firestore:rules`). Otherwise the client loses the write before the server can make it.
```

- [ ] **Step 7: Run the tests and checks to verify they pass**

Run (in unijob-web/functions): `npx vitest run --project unit`. Expected: PASS, 10 tests.
Run (in unijob-web/functions): `npm run typecheck` then `npm run build`. Expected: both exit 0. `lib/admin.js` and `lib/config.js` exist.
Run (in unijob-web): `npx eslint functions`. Expected: no errors.
Run (worktree root): `node scripts/ci-local.mjs --quick`. Expected: ALL GREEN.

- [ ] **Step 8: Commit**

```powershell
git add .gitignore unijob-web/firebase.json unijob-web/eslint.config.js unijob-web/functions
git commit -m "feat(functions): scaffold functions package bound to the named database [task:1]"
```

Check `git status` first: `functions/lib/`, `functions/coverage/` and `functions/node_modules/` must not be staged.

---

### Task 2: Wire functions into ci-local, GitHub Actions and CLAUDE.md

**Files:**
- Modify: `scripts/ci/checks.mjs`, `scripts/ci-local.mjs`
- Modify: `unijob-web/package.json` (scripts)
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (Layout, Commands)
- Test: `tests/tooling/ci/checks.test.mjs` (add tests), `tests/tooling/ci/ci-workflow.test.mjs` (new)

**Interfaces:**
- Consumes: functions npm scripts `typecheck`, `build`, `test`, `test:ci` (Task 1). Coverage output `unijob-web/functions/coverage/coverage-summary.json`.
- Produces:
  - `checks.mjs`: `export function functionsAffected(changed: string[]): boolean` and `export function coveragePctByFile(summaries: object[], root: string): Record<string, number>`.
  - ci-local gates `functions-typecheck` and `functions-tests`. The `coverage` gate reads both summaries.
  - `unijob-web` npm script `test:functions`.

- [ ] **Step 1: Write the failing tooling tests**

Append to `tests/tooling/ci/checks.test.mjs` and add `coveragePctByFile, functionsAffected` to its import from `../../../scripts/ci/checks.mjs`:

```js
test('functionsAffected: functions files, mirrored web files and firebase.json trigger the functions gates', () => {
  assert.equal(functionsAffected(['unijob-web/functions/src/admin.ts']), true);
  assert.equal(functionsAffected(['unijob-web/functions/package.json']), true);
  assert.equal(functionsAffected(['unijob-web/src/lib/fees.ts']), true);
  assert.equal(functionsAffected(['unijob-web/src/types/notification.ts']), true);
  assert.equal(functionsAffected(['unijob-web/firebase.json']), true);
});

test('functionsAffected: other web and repo files do not', () => {
  assert.equal(functionsAffected(['unijob-web/src/lib/utils.ts', 'unijob-web/src/pages/Home.tsx', 'scripts/ci-local.mjs', 'docs/x.md']), false);
  assert.equal(functionsAffected([]), false);
});

test('coveragePctByFile: merges web and functions summaries, skips total, repo-relative keys', () => {
  const web = { total: { lines: { pct: 50 } }, '/r/unijob-web/src/lib/fees.ts': { lines: { pct: 100 } } };
  const fn = { total: { lines: { pct: 90 } }, '/r/unijob-web/functions/src/admin.ts': { lines: { pct: 80 } } };
  assert.deepEqual(coveragePctByFile([web, fn], '/r'), {
    'unijob-web/src/lib/fees.ts': 100,
    'unijob-web/functions/src/admin.ts': 80,
  });
});
```

Create `tests/tooling/ci/ci-workflow.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yml = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('ci.yml installs functions dependencies with npm ci', () => {
  assert.match(yml, /working-directory: unijob-web\/functions\s*\r?\n\s*run: npm ci/);
});

test('ci.yml caches both lockfiles', () => {
  assert.match(yml, /unijob-web\/package-lock\.json/);
  assert.match(yml, /unijob-web\/functions\/package-lock\.json/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (worktree root): `node --test "tests/tooling/**/*.test.mjs"`
Expected: FAIL. `functionsAffected` and `coveragePctByFile` are not exported, and the ci.yml assertions do not match.

- [ ] **Step 3: Implement the helpers**

Add to `scripts/ci/checks.mjs`:

```js
/** Changes that can break the functions package: its own files, plus web files it mirrors or reads. */
const FUNCTIONS_INPUTS = [
  /^unijob-web\/functions\//,
  /^unijob-web\/src\/lib\/fees\.ts$/,
  /^unijob-web\/src\/types\/notification\.ts$/,
  /^unijob-web\/firebase\.json$/,
];

export function functionsAffected(changed) {
  return changed.some((f) => FUNCTIONS_INPUTS.some((re) => re.test(f)));
}

/** Line coverage % per repo-relative file, merged from several istanbul json-summary objects. */
export function coveragePctByFile(summaries, root) {
  const pct = {};
  for (const summary of summaries) {
    for (const [abs, v] of Object.entries(summary)) if (abs !== 'total') pct[toRepoRelative(abs, root)] = v.lines.pct;
  }
  return pct;
}
```

- [ ] **Step 4: Wire the gates in `scripts/ci-local.mjs`**

1. Import `coveragePctByFile, functionsAffected` from `./ci/checks.mjs`.
2. After `const web = …` add `const fnDir = join(web, 'functions');`. After the `toolingChanged` line add `const fnAffected = functionsAffected(changed);`.
3. Right after the `typecheck` gate:

```js
gate('functions-typecheck', () => {
  if (mode === 'quick' && !fnAffected) return { ok: true, skipped: true, summary: 'no functions changes' };
  // full also builds, proving the predeploy step emits lib/
  const r = run(mode === 'full' ? 'npm run typecheck && npm run build' : 'npm run typecheck', fnDir);
  return { ok: r.ok, summary: r.tail };
});
```

4. Right after the `unit-tests` gate, before `tooling-tests`:

```js
gate('functions-tests', () => {
  if (mode === 'quick') {
    if (!fnAffected) return { ok: true, skipped: true, summary: 'no functions changes' };
    // unit project only: emulator tests need Java and a ~10 s emulator boot, so they run in --full
    const r = run('npm test', fnDir);
    return { ok: r.ok, summary: r.tail };
  }
  const r = run('npm run test:functions'); // in unijob-web: Firestore emulator + all projects + coverage
  return { ok: r.ok, summary: r.tail };
});
```

5. Replace the `coverage` gate so it reads both summaries:

```js
gate('coverage', () => {
  const summaryPaths = [join(web, 'coverage', 'coverage-summary.json'), join(fnDir, 'coverage', 'coverage-summary.json')];
  const missing = summaryPaths.filter((p) => !existsSync(p));
  if (missing.length) return { ok: false, summary: `${missing.map((p) => toRepoRelative(p, root)).join(', ')} missing — did unit-tests or functions-tests fail?` };
  const pct = coveragePctByFile(summaryPaths.map((p) => JSON.parse(readFileSync(p, 'utf8'))), root);
  const legacy = JSON.parse(readFileSync(join(root, 'ci', 'coverage-legacy.json'), 'utf8'));
  const bad = coverageViolations(changed, pct, legacy);
  return {
    ok: bad.length === 0,
    summary: bad.length ? bad.map((b) => `${b.file}: ${b.pct}% < 70%`).join('\n') : 'changed in-scope files meet 70% lines',
    files: bad.map((b) => b.file),
  };
});
```

6. `npm-audit` gate audits both packages:

```js
gate('npm-audit', () => {
  const webAudit = run('npm audit --omit=dev --audit-level=high');
  const fnAudit = run('npm audit --omit=dev --audit-level=high', fnDir);
  return { ok: webAudit.ok && fnAudit.ok, summary: `web:\n${webAudit.tail}\nfunctions:\n${fnAudit.tail}` };
});
```

`checks.mjs` `COVERAGE_SCOPE` already includes `unijob-web/functions/src/**`. Do not change it or `COVERAGE_MIN`.

- [ ] **Step 5: npm script, GitHub Actions, CLAUDE.md**

`unijob-web/package.json` scripts, after `test:rules`:

```json
"test:functions": "firebase emulators:exec --only firestore --project demo-unijob \"npm --prefix functions run test:ci\""
```

`.github/workflows/ci.yml`: change `cache-dependency-path` and add an install step after `Install`:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: |
            unijob-web/package-lock.json
            unijob-web/functions/package-lock.json
```

```yaml
      - name: Install functions
        working-directory: unijob-web/functions
        run: npm ci
```

`CLAUDE.md`:
- Layout, new bullet after the `unijob-web/firestore.rules` bullet: ``- `unijob-web/functions/` — Cloud Functions v2 (TS, Node 22, region `asia-southeast1`), its own package (`npm ci` there too). `src/admin.ts` binds the Admin SDK to `kirigitejkf8095h`; helpers in `src/lib/`. Tests: `functions/tests/unit` (no emulator) and `functions/tests/emulator`. Deploy notes: `unijob-web/functions/README.md`.``
- Commands, new bullet after the unit/rules tests line: ``- Functions: `cd unijob-web/functions && npm test` (unit) · `cd unijob-web && npm run test:functions` (unit + emulator + coverage, needs Java ≥ 11)``

- [ ] **Step 6: Run to verify**

Run (worktree root): `node --test "tests/tooling/**/*.test.mjs"`. Expected: PASS, including the 5 new tests.
Run (in unijob-web): `npm run test:functions`. Expected: the emulator starts, the unit tests pass, and `functions/coverage/coverage-summary.json` is written. The `emulator` project has no files yet; that is fine as long as the run exits 0. If Vitest exits non-zero only because of "No test files found" for that project, report it in the commit body and move on: Task 4 adds the first emulator test, and `--full` only runs at the end of the build.
Run (in unijob-web/functions): `npm run typecheck` and `npm test`. These are the exact commands the two new quick gates run. Expected: both exit 0.
Run (worktree root): `node scripts/ci-local.mjs --quick`. Expected: ALL GREEN. In this task `functions-typecheck` and `functions-tests` show `(skipped)`, because `--quick` diffs against HEAD and no functions input changed since Task 1's commit. From Task 3 on they must show PASS, not skipped.

- [ ] **Step 7: Commit**

```powershell
git add scripts/ci/checks.mjs scripts/ci-local.mjs tests/tooling/ci unijob-web/package.json .github/workflows/ci.yml CLAUDE.md
git commit -m "ci: add functions typecheck/tests gates and merged coverage [task:2]"
```

---

### Task 3: requireAuth, assertMember and the ping callable

**Files:**
- Create: `unijob-web/functions/src/lib/types.ts`, `unijob-web/functions/src/lib/auth.ts`, `unijob-web/functions/src/ping.ts`, `unijob-web/functions/src/index.ts`
- Test: `unijob-web/functions/tests/unit/auth.test.ts`, `unijob-web/functions/tests/unit/ping.test.ts`

**Interfaces:**
- Consumes: `REGION` from `src/config.ts` (Task 1).
- Produces:
  - `src/lib/types.ts`: `export type MemberRole = 'poster' | 'worker'`, `export interface JobMembership { postedBy: string; assignedTo?: string[] }`.
  - `src/lib/auth.ts`: `requireAuth(request: Pick<CallableRequest<unknown>, 'auth'>): string` (returns the uid), `assertMember(job: JobMembership | undefined, uid: string): MemberRole`, plus message constants `MSG_UNAUTHENTICATED`, `MSG_NOT_MEMBER`, `MSG_JOB_NOT_FOUND`.
  - `src/index.ts`: `export { ping } from './ping.js'`. `ping` returns `PingResult = { ok: true; uid: string; region: string }`.

- [ ] **Step 1: Write the failing tests**

`unijob-web/functions/tests/unit/auth.test.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { assertMember, MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER, MSG_UNAUTHENTICATED, requireAuth } from '../../src/lib/auth.js';

function thrown(fn: () => unknown): HttpsError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return err as HttpsError;
  }
  throw new Error('expected an HttpsError');
}

const auth = (uid: string) => ({ auth: { uid, token: {} as never, rawToken: '' } });

describe('requireAuth', () => {
  it('returns the uid of a signed-in caller', () => {
    expect(requireAuth(auth('alice'))).toBe('alice');
  });

  it('throws unauthenticated with a Vietnamese message when auth is missing', () => {
    const err = thrown(() => requireAuth({ auth: undefined }));
    expect(err.code).toBe('unauthenticated');
    expect(err.message).toBe(MSG_UNAUTHENTICATED);
  });

  it('throws unauthenticated when auth.uid is empty', () => {
    expect(thrown(() => requireAuth(auth(''))).code).toBe('unauthenticated');
  });
});

describe('assertMember', () => {
  const job = { postedBy: 'poster', assignedTo: ['worker'] };

  it('returns poster for the job poster', () => {
    expect(assertMember(job, 'poster')).toBe('poster');
  });

  it('returns worker for an assigned worker', () => {
    expect(assertMember(job, 'worker')).toBe('worker');
  });

  it('returns poster when the poster is also listed in assignedTo', () => {
    expect(assertMember({ postedBy: 'p', assignedTo: ['p'] }, 'p')).toBe('poster');
  });

  it('treats a missing assignedTo as no workers', () => {
    expect(assertMember({ postedBy: 'poster' }, 'poster')).toBe('poster');
    expect(thrown(() => assertMember({ postedBy: 'poster' }, 'worker')).code).toBe('permission-denied');
  });

  it('throws permission-denied with a Vietnamese message for a non-member (e.g. an unassigned applicant)', () => {
    const err = thrown(() => assertMember(job, 'carol'));
    expect(err.code).toBe('permission-denied');
    expect(err.message).toBe(MSG_NOT_MEMBER);
  });

  it('throws permission-denied for an empty uid even if assignedTo contains an empty string', () => {
    expect(thrown(() => assertMember({ postedBy: 'poster', assignedTo: [''] }, '')).code).toBe('permission-denied');
  });

  it('throws not-found when the job is undefined', () => {
    const err = thrown(() => assertMember(undefined, 'poster'));
    expect(err.code).toBe('not-found');
    expect(err.message).toBe(MSG_JOB_NOT_FOUND);
  });
});
```

`unijob-web/functions/tests/unit/ping.test.ts`:

```ts
import functionsTest from 'firebase-functions-test';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { afterAll, describe, expect, it } from 'vitest';
import { ping } from '../../src/index.js';

const t = functionsTest({ projectId: 'demo-unijob' });
afterAll(() => t.cleanup());

const request = (uid?: string) =>
  ({ data: {}, auth: uid ? { uid, token: {}, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => t.wrap(ping)(req));

describe('ping', () => {
  it('returns ok, the caller uid and the region when signed in', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ ok: true, uid: 'alice', region: 'asia-southeast1' });
  });

  it('rejects signed-out callers with unauthenticated', async () => {
    await expect(call(request())).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('is declared in asia-southeast1', () => {
    expect(ping.__endpoint.region).toEqual(['asia-southeast1']);
  });
});
```

If `t.wrap(ping)` does not type-check against the installed `firebase-functions-test`, call `ping.run(req)` instead. That is the v2 callable's own test entry point. Keep the rest of the test unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run (in unijob-web/functions): `npx vitest run --project unit tests/unit/auth.test.ts tests/unit/ping.test.ts`
Expected: FAIL. `../../src/lib/auth.js` and `../../src/index.js` cannot be resolved.

- [ ] **Step 3: Implement**

`unijob-web/functions/src/lib/types.ts`:

```ts
export type MemberRole = 'poster' | 'worker';

/** The fields of a `jobs/{jobId}` document that decide membership. */
export interface JobMembership {
  postedBy: string;
  assignedTo?: string[];
}
```

`unijob-web/functions/src/lib/auth.ts`:

```ts
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { JobMembership, MemberRole } from './types.js';

export const MSG_UNAUTHENTICATED = 'Bạn cần đăng nhập để thực hiện thao tác này.';
export const MSG_NOT_MEMBER = 'Bạn không có quyền thực hiện thao tác này với công việc này.';
export const MSG_JOB_NOT_FOUND = 'Không tìm thấy công việc.';

/** uid of the signed-in caller, or HttpsError('unauthenticated'). */
export function requireAuth(request: Pick<CallableRequest<unknown>, 'auth'>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', MSG_UNAUTHENTICATED);
  return uid;
}

/** The caller's role on the job: poster wins if listed twice. Applicants who are not assigned are not members. */
export function assertMember(job: JobMembership | undefined, uid: string): MemberRole {
  if (!job) throw new HttpsError('not-found', MSG_JOB_NOT_FOUND);
  if (!uid) throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
  if (job.postedBy === uid) return 'poster';
  if (Array.isArray(job.assignedTo) && job.assignedTo.includes(uid)) return 'worker';
  throw new HttpsError('permission-denied', MSG_NOT_MEMBER);
}
```

`unijob-web/functions/src/ping.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { REGION } from './config.js';
import { requireAuth } from './lib/auth.js';

export interface PingResult {
  ok: true;
  uid: string;
  region: string;
}

/** Wiring check: proves deploy, region and auth. No data access. */
export const ping = onCall({ region: REGION }, (request): PingResult => ({ ok: true, uid: requireAuth(request), region: REGION }));
```

`unijob-web/functions/src/index.ts`:

```ts
export { ping } from './ping.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (in unijob-web/functions): `npm test`. Expected: PASS (auth 10, ping 3, plus Task 1 tests).
Run (in unijob-web/functions): `npx vitest run --project unit --coverage`. Expected: `src/lib/auth.ts`, `src/ping.ts` and `src/index.ts` are each ≥ 70% lines (expect 100%).
Run (worktree root): `node scripts/ci-local.mjs --quick`. Expected: ALL GREEN, with `functions-typecheck` and `functions-tests` PASS (not skipped).

- [ ] **Step 5: Commit**

```powershell
git add unijob-web/functions/src unijob-web/functions/tests
git commit -m "feat(functions): add requireAuth, assertMember and ping callable [task:3]"
```

---

### Task 4: Idempotent writeNotification with emulator tests

**Files:**
- Create: `unijob-web/functions/src/lib/notifications.ts`, `unijob-web/functions/tests/support/emulator.ts`
- Modify: `unijob-web/functions/src/lib/types.ts` (add `NotificationType`)
- Test: `unijob-web/functions/tests/unit/notifications.test.ts`, `unijob-web/functions/tests/unit/emulator-guard.test.ts`, `unijob-web/functions/tests/emulator/notifications.emulator.test.ts`

**Interfaces:**
- Consumes: `db`, `app` from `src/admin.ts` (Task 1). Script `npm run test:functions` (Task 2).
- Produces:
  - `src/lib/types.ts`: `export type NotificationType = 'new_application' | 'application_accepted' | 'application_rejected' | 'job_completed' | 'job_cancelled' | 'deadline_expired' | 'completion_requested' | 'job_invite'` (same members as `unijob-web/src/types/notification.ts`).
  - `src/lib/notifications.ts`: `interface NotificationExtras { jobId?: string; jobTitle?: string; fromName?: string }`, `interface NotificationInput { userId: string; type: NotificationType; message: string; extras?: NotificationExtras; eventKey: string }`, `assertValidEventKey(eventKey: string): void`, `writeNotification(db: Firestore, input: NotificationInput): Promise<boolean>`. Returns `true` if created and `false` if the event was already written.
  - `tests/support/emulator.ts`: `assertEmulatorEnv(env?: NodeJS.ProcessEnv): void`.

Document shape written to `notifications/{eventKey}` (matches what `notification.service.ts` reads): `{ userId, type, message, read: false, createdAt: serverTimestamp(), jobId?, jobTitle?, fromName? }`.

- [ ] **Step 1: Write the failing unit tests**

`unijob-web/functions/tests/unit/notifications.test.ts`:

```ts
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { writeNotification, type NotificationInput } from '../../src/lib/notifications.js';

type Call = { collection: string; id: string; data: Record<string, unknown> };

function fakeDb(create: () => Promise<unknown>) {
  const calls: Call[] = [];
  const db = {
    collection: (collection: string) => ({
      doc: (id: string) => ({
        create: (data: Record<string, unknown>) => {
          calls.push({ collection, id, data });
          return create();
        },
      }),
    }),
  } as unknown as Firestore;
  return { db, calls };
}

const input: NotificationInput = {
  userId: 'poster',
  type: 'new_application',
  message: 'Có ứng viên mới',
  extras: { jobId: 'job1', jobTitle: 'Nhập liệu', fromName: 'Carol' },
  eventKey: 'new_application_app1',
};

describe('writeNotification', () => {
  it('creates notifications/{eventKey} with read false, a server timestamp and the given fields', async () => {
    const { db, calls } = fakeDb(() => Promise.resolve());
    await expect(writeNotification(db, input)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    const { collection, id, data } = calls[0];
    expect(collection).toBe('notifications');
    expect(id).toBe('new_application_app1');
    expect(data).toMatchObject({ userId: 'poster', type: 'new_application', message: 'Có ứng viên mới', read: false, jobId: 'job1', jobTitle: 'Nhập liệu', fromName: 'Carol' });
    expect(FieldValue.serverTimestamp().isEqual(data.createdAt as FieldValue)).toBe(true);
  });

  it('returns false when the document already exists (duplicate event)', async () => {
    const { db } = fakeDb(() => Promise.reject(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 })));
    await expect(writeNotification(db, input)).resolves.toBe(false);
  });

  it('rethrows any other error', async () => {
    const { db } = fakeDb(() => Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 7 })));
    await expect(writeNotification(db, input)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('drops undefined extras and keys other than jobId, jobTitle, fromName', async () => {
    const { db, calls } = fakeDb(() => Promise.resolve());
    const extras = { jobId: 'job1', jobTitle: undefined, amount: 5 } as unknown as NotificationInput['extras'];
    await writeNotification(db, { ...input, extras });
    expect(calls[0].data).not.toHaveProperty('jobTitle');
    expect(calls[0].data).not.toHaveProperty('amount');
    expect(calls[0].data.jobId).toBe('job1');
  });

  it('core fields win over colliding extras', async () => {
    const { db, calls } = fakeDb(() => Promise.resolve());
    const extras = { userId: 'mallory', read: true, jobId: 'job1' } as unknown as NotificationInput['extras'];
    await writeNotification(db, { ...input, extras });
    expect(calls[0].data.userId).toBe('poster');
    expect(calls[0].data.read).toBe(false);
  });

  it.each(['', 'a/b', '.', '..', '__reserved__', 'x'.repeat(1501)])('rejects eventKey %j before writing', async (eventKey) => {
    const { db, calls } = fakeDb(() => Promise.resolve());
    await expect(writeNotification(db, { ...input, eventKey })).rejects.toThrow(/eventKey/);
    expect(calls).toHaveLength(0);
  });

  it('rejects an empty userId before writing', async () => {
    const { db, calls } = fakeDb(() => Promise.resolve());
    await expect(writeNotification(db, { ...input, userId: '' })).rejects.toThrow(/userId/);
    expect(calls).toHaveLength(0);
  });
});
```

`unijob-web/functions/tests/unit/emulator-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertEmulatorEnv } from '../support/emulator.js';

describe('assertEmulatorEnv', () => {
  it('passes with an emulator host and a demo- project', () => {
    expect(() => assertEmulatorEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-unijob' })).not.toThrow();
  });

  it('throws when FIRESTORE_EMULATOR_HOST is missing', () => {
    expect(() => assertEmulatorEnv({ GCLOUD_PROJECT: 'demo-unijob' })).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });

  it('throws when the project is not a demo- project', () => {
    expect(() => assertEmulatorEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'unijob-prod' })).toThrow(/demo-/);
    expect(() => assertEmulatorEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/demo-/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (in unijob-web/functions): `npx vitest run --project unit tests/unit/notifications.test.ts tests/unit/emulator-guard.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement**

Append to `unijob-web/functions/src/lib/types.ts`:

```ts
/** Keep identical to unijob-web/src/types/notification.ts (type parity test in tests/unit/parity.test.ts). */
export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'job_completed'
  | 'job_cancelled'
  | 'deadline_expired'
  | 'completion_requested'
  | 'job_invite';
```

`unijob-web/functions/src/lib/notifications.ts`:

```ts
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { NotificationType } from './types.js';

export interface NotificationExtras {
  jobId?: string;
  jobTitle?: string;
  fromName?: string;
}

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  message: string;
  extras?: NotificationExtras;
  /** Deterministic id of the event (e.g. `new_application_<applicationId>`). Same event → same doc. */
  eventKey: string;
}

const EXTRA_KEYS = ['jobId', 'jobTitle', 'fromName'] as const;
const GRPC_ALREADY_EXISTS = 6;

/** Firestore document-id rules; a '/' would silently write into a subcollection path. */
export function assertValidEventKey(eventKey: string): void {
  const invalid =
    !eventKey ||
    eventKey.includes('/') ||
    eventKey === '.' ||
    eventKey === '..' ||
    /^__.*__$/.test(eventKey) ||
    Buffer.byteLength(eventKey, 'utf8') > 1500;
  if (invalid) throw new Error(`writeNotification: invalid eventKey ${JSON.stringify(eventKey.slice(0, 80))}`);
}

/**
 * Creates notifications/{eventKey}. Returns false (no write) if that event was already delivered,
 * so retried or duplicated triggers are no-ops.
 */
export async function writeNotification(db: Firestore, input: NotificationInput): Promise<boolean> {
  assertValidEventKey(input.eventKey);
  if (!input.userId) throw new Error('writeNotification: userId is required');
  const extras: Record<string, string> = {};
  for (const key of EXTRA_KEYS) {
    const value = input.extras?.[key];
    if (value !== undefined) extras[key] = value;
  }
  try {
    await db.collection('notifications').doc(input.eventKey).create({
      ...extras,
      userId: input.userId,
      type: input.type,
      message: input.message,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    if ((err as { code?: unknown }).code === GRPC_ALREADY_EXISTS) return false;
    throw err;
  }
}
```

`unijob-web/functions/tests/support/emulator.ts`:

```ts
/** Refuse to run emulator tests anywhere but the local emulator with a demo- project. */
export function assertEmulatorEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set — run emulator tests via `npm run test:functions` in unijob-web');
  }
  const project = env.GCLOUD_PROJECT;
  if (!project?.startsWith('demo-')) {
    throw new Error(`refusing to run emulator tests against project ${String(project)} (must start with demo-)`);
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run (in unijob-web/functions): `npm test`. Expected: PASS.

- [ ] **Step 5: Write the emulator test**

`unijob-web/functions/tests/emulator/notifications.emulator.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeNotification, type NotificationInput } from '../../src/lib/notifications.js';
import { assertEmulatorEnv } from '../support/emulator.js';

let app: App;
let db: Firestore;

beforeAll(async () => {
  assertEmulatorEnv();
  ({ app, db } = await import('../../src/admin.js')); // only after the guard
});

// Unique keys per run instead of clearing the database between tests.
const input = (eventKey: string, message = 'Có ứng viên mới'): NotificationInput => ({
  userId: 'poster',
  type: 'new_application',
  message,
  extras: { jobId: 'job1' },
  eventKey,
});

describe('writeNotification on the Firestore emulator', () => {
  it('a duplicate event with the same eventKey is a no-op', async () => {
    const key = `test_${randomUUID()}`;
    await expect(writeNotification(db, input(key))).resolves.toBe(true);
    await expect(writeNotification(db, input(key, 'tin nhắn khác'))).resolves.toBe(false);
    const snap = await db.collection('notifications').doc(key).get();
    expect(snap.data()).toMatchObject({ userId: 'poster', message: 'Có ứng viên mới', read: false, jobId: 'job1' });
    expect(snap.get('createdAt')).toBeInstanceOf(Timestamp);
  });

  it('concurrent duplicates create exactly one notification', async () => {
    const key = `test_${randomUUID()}`;
    const results = await Promise.all([writeNotification(db, input(key)), writeNotification(db, input(key))]);
    expect(results.sort()).toEqual([false, true]);
    const docs = await db.collection('notifications').where('__name__', '==', db.collection('notifications').doc(key)).get();
    expect(docs.size).toBe(1);
  });

  it('writes to the named database kirigitejkf8095h, not (default)', async () => {
    const key = `test_${randomUUID()}`;
    await writeNotification(db, input(key));
    expect((await db.collection('notifications').doc(key).get()).exists).toBe(true);
    expect((await getFirestore(app).collection('notifications').doc(key).get()).exists).toBe(false);
  });
});
```

- [ ] **Step 6: Run the emulator tests and checks**

Run (in unijob-web): `npm run test:functions`
Expected: both projects PASS (emulator: 3 tests). `functions/coverage/coverage-summary.json` shows `src/lib/notifications.ts` ≥ 70% lines.
Negative check, then discard: run `npx vitest run --project emulator` in unijob-web/functions without the emulator. Expected: FAIL with "FIRESTORE_EMULATOR_HOST is not set", and nothing is written anywhere.
Run (worktree root): `node scripts/ci-local.mjs --quick`. Expected: ALL GREEN.

- [ ] **Step 7: Commit**

```powershell
git add unijob-web/functions/src unijob-web/functions/tests
git commit -m "feat(functions): add idempotent writeNotification with emulator tests [task:4]"
```

---

### Task 5: Platform fee copy with web parity tests

**Files:**
- Create: `unijob-web/functions/src/lib/fees.ts`
- Test: `unijob-web/functions/tests/unit/fees.test.ts`, `unijob-web/functions/tests/unit/parity.test.ts`

**Interfaces:**
- Consumes: `NotificationType` from `src/lib/types.ts` (Task 4). The web files `unijob-web/src/lib/fees.ts` and `unijob-web/src/types/notification.ts` are imported by tests only. Both are free of `@/` alias imports. Keep it that way, or the parity test cannot resolve them.
- Produces: `src/lib/fees.ts`: `export function calculatePlatformFee(amount: number): number`. Slice 4 (`feat/server-escrow`) imports it from here.

- [ ] **Step 1: Write the failing tests**

`unijob-web/functions/tests/unit/fees.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculatePlatformFee } from '../../src/lib/fees.js';

describe('calculatePlatformFee', () => {
  it('is 0 for volunteer (0đ) and negative amounts', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(-50_000)).toBe(0);
  });

  it('is 3% under 200,000đ', () => {
    expect(calculatePlatformFee(100_000)).toBe(3_000);
    expect(calculatePlatformFee(199_999)).toBe(6_000);
  });

  it('is 5% from 200,000đ to 1,000,000đ inclusive', () => {
    expect(calculatePlatformFee(200_000)).toBe(10_000);
    expect(calculatePlatformFee(1_000_000)).toBe(50_000);
  });

  it('is 4% above 1,000,000đ', () => {
    expect(calculatePlatformFee(1_000_001)).toBe(40_000);
    expect(calculatePlatformFee(5_000_000)).toBe(200_000);
  });
});
```

`unijob-web/functions/tests/unit/parity.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { calculatePlatformFee as webFee } from '../../../src/lib/fees.ts';
import type { NotificationType as WebNotificationType } from '../../../src/types/notification.ts';
import { calculatePlatformFee } from '../../src/lib/fees.js';
import type { NotificationType } from '../../src/lib/types.js';

const AMOUNTS = [-1, 0, 0.4, 1, 33, 199_999, 200_000, 200_001, 999_999, 1_000_000, 1_000_001, 12_345_678, Number.NaN];

describe('parity with the web app', () => {
  it.each(AMOUNTS)('calculatePlatformFee(%d) equals the web copy', (amount) => {
    expect(calculatePlatformFee(amount)).toEqual(webFee(amount));
  });

  it('NotificationType equals the web union', () => {
    expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType>();
  });
});
```

The `expectTypeOf` line is enforced by `npm run typecheck` (`tsconfig.dev.json` includes `tests`), which the `functions-typecheck` gate runs. `functionsAffected` (Task 2) makes both gates run in `--quick` when either web file changes.

- [ ] **Step 2: Run them to verify they fail**

Run (in unijob-web/functions): `npx vitest run --project unit tests/unit/fees.test.ts tests/unit/parity.test.ts`
Expected: FAIL. `../../src/lib/fees.js` cannot be resolved.

- [ ] **Step 3: Implement**

`unijob-web/functions/src/lib/fees.ts`. The body is identical to `unijob-web/src/lib/fees.ts`:

```ts
/**
 * Copy of unijob-web/src/lib/fees.ts. Functions deploy from functions/ only, so they cannot import web code.
 * Keep both identical: tests/unit/parity.test.ts compares them across every tier boundary.
 *
 * Tính phí nền tảng theo bậc:
 * - Volunteer / 0đ: 0%
 * - < 200,000đ:     3%
 * - 200,000–1,000,000đ: 5%
 * - > 1,000,000đ:   4%
 */
export function calculatePlatformFee(amount: number): number {
  if (amount <= 0) return 0;
  if (amount < 200_000) return Math.round(amount * 0.03);
  if (amount <= 1_000_000) return Math.round(amount * 0.05);
  return Math.round(amount * 0.04);
}
```

- [ ] **Step 4: Run to verify they pass, and prove the type parity bites**

Run (in unijob-web/functions): `npm test`. Expected: PASS.
Run (in unijob-web/functions): `npm run typecheck`. Expected: exit 0.
Sanity check, then revert: temporarily delete `| 'job_invite'` from `functions/src/lib/types.ts` and run `npm run typecheck`. Expected: a type error in `tests/unit/parity.test.ts`. Restore the line.
Run (in unijob-web): `npm run test:functions`. Expected: PASS. Every file under `functions/src/` is ≥ 70% lines in `functions/coverage/coverage-summary.json`.
Run (worktree root): `node scripts/ci-local.mjs --quick`. Expected: ALL GREEN.

- [ ] **Step 5: Commit**

```powershell
git add unijob-web/functions/src/lib/fees.ts unijob-web/functions/tests/unit/fees.test.ts unijob-web/functions/tests/unit/parity.test.ts
git commit -m "feat(functions): add platform fee calculation with web parity tests [task:5]"
```

---

## After the last task

The uj-build workflow runs `node scripts/ci-local.mjs --full`. Expected: ALL GREEN, including `functions-typecheck` (typecheck + build), `functions-tests` (emulator), `coverage` (web + functions summaries) and `npm-audit` (both packages). The PR body must say: no deploy in this slice; deploying functions needs the Blaze plan; in later slices, deploy functions before rules.
