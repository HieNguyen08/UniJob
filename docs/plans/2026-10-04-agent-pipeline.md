---
title: UniJob Agent Pipeline — Implementation Plan
status: approved
date: 2026-10-04
spec: docs/specs/2026-10-04-agent-pipeline-design.md
branch: chore/agent-pipeline
---

# UniJob Agent Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit vào repo một đội 7 agent, 5 lệnh `/uj-*`, workflow `uj-build`, CI local `scripts/ci-local.mjs`, hooks bảo vệ và GitHub Actions, để mọi thay đổi UniJob sau này đi qua quy trình brainstorm → spec ⛔ → plan ⛔ → build loop → ship ⛔.

**Architecture:** Toàn bộ là file trong repo. Phần chạy được (CI, hooks, logic vòng lặp workflow) là Node ESM có test bằng `node:test`. Phần prompt (agents, commands) là Markdown. Trạng thái CI được ghi vào `ci/last-run.json` với `fingerprint` = tree sha của working tree. Hook so fingerprint này để chặn commit/push khi code đã đổi sau lần CI cuối.

**Tech Stack:** Node 24 ESM, `node:test`, Vitest 5 + `@vitest/coverage-v8`, `@firebase/rules-unit-testing` 5, `firebase-tools` 15 (Emulator Suite), Vite 8.3 (stable), GitHub Actions, Claude Code agents/commands/hooks/Workflow.

**Spec:** `docs/specs/2026-10-04-agent-pipeline-design.md`

## Global Constraints

- **Không bao giờ** có trailer `Co-Authored-By` trong commit, kể cả commit của plan này. Không có footer "Generated with Claude Code" trong PR.
- Mọi PR tạo bằng `gh pr create --base main --assignee @me` (gh đăng nhập HieNguyen08).
- Commit theo Conventional Commits (`feat|fix|chore|test|docs|refactor: …`).
- Ngưỡng finding blocking: severity ∈ {critical, high, medium} **và** confidence ≥ 80. Tối đa 3 vòng fix mỗi task; tối đa 2 vòng fix CI; tối đa 4 agent song song.
- Coverage ≥ 70% lines cho file mới/đổi trong `unijob-web/src/services/**`, `unijob-web/src/lib/**`, `unijob-web/functions/src/**`. File cũ chưa có test nằm trong `ci/coverage-legacy.json` và chỉ được báo số.
- Bundle: gzip của entry chunk tăng ≤ 10% so với `ci/budget.json`.
- `npm audit --omit=dev --audit-level=high` phải sạch.
- Emulator luôn dùng project id `demo-unijob`, không bao giờ trỏ vào project thật `unijob-ad6eb`.
- Mọi đường dẫn trong script phải chạy được trên Windows (PowerShell/Git Bash) và Ubuntu.

## Review Focus

1. **Commit một phần working tree.** Người commit `git add` một file khi còn file khác đang sửa. Fingerprint vẫn khớp vì CI đã kiểm toàn bộ working tree, nên hook phải cho qua. Test nằm ở Task 5 (`allows commit when fingerprint matches`).
2. **Lệnh git chạy trong worktree** (`git -C .worktrees/x commit`, hoặc `cd .worktrees/x && git commit`). Hook phải đọc `ci/last-run.json` của worktree, không phải của repo chính. Test ở Task 5 (`parseGitCommand` với `-C` và `cd &&`).
3. **Push sau khi đã commit đúng cây CI đã kiểm.** Tree của HEAD bằng fingerprint của `--full`, nên phải được push. Ngược lại, chỉ có `--quick` thì bị chặn. Test ở Task 4 (fingerprint bằng `HEAD^{tree}` sau commit) và Task 5.
4. **Reviewer agent chết hoặc trả `null` giữa vòng lặp.** Workflow phải dừng với `status: 'error'`, không được coi là "không có finding". Test ở Task 7.
5. **Finding confidence < 80 hoặc severity low** không được làm vòng lặp lặp lại, nhưng phải xuất hiện trong `followUps` (đã dedupe). Test ở Task 7.

---

## File Structure

```
UniJob/
├── .gitignore                                  (Task 1: modify)
├── CLAUDE.md                                   (Task 9: create)
├── CHANGELOG.md                                (Task 9: create)
├── .claude/
│   ├── settings.json                           (Task 5)
│   ├── hooks/guard-commit.mjs (+ .test.mjs)    (Task 5)
│   ├── hooks/guard-secrets.mjs (+ .test.mjs)   (Task 5)
│   ├── agents/uj-*.md  (7 files)               (Task 6)
│   ├── workflows/uj-build.js                   (Task 7)
│   └── commands/uj-*.md (5 files)              (Task 8)
├── scripts/
│   ├── ci-local.mjs                            (Task 4)
│   ├── ci/git.mjs (+ git.test.mjs)             (Task 4)
│   ├── ci/checks.mjs (+ checks.test.mjs)       (Task 4)
│   └── ci/uj-build.workflow.test.mjs           (Task 7)
├── ci/budget.json, ci/coverage-legacy.json     (Task 4)
├── .github/workflows/ci.yml                    (Task 9)
├── .github/pull_request_template.md            (Task 9)
├── docs/plans/.gitkeep, docs/runs/.gitkeep     (Task 9)
└── unijob-web/
    ├── package.json, package-lock.json         (Tasks 1–3)
    ├── vitest.config.ts                        (Task 2)
    ├── tsconfig.node.json                      (Task 2)
    ├── firebase.json                           (Task 3)
    ├── src/lib/fees.ts (+ fees.test.ts)        (Task 2)
    ├── src/services/payment.service.ts         (Task 2)
    ├── tests/rules/firestore.rules.test.ts     (Task 3)
    └── 8 file có lỗi lint                      (Task 1)
```

Tên agent có tiền tố `uj-` (spec ghi `implementer`, `code-reviewer`, …) để tránh trùng với agent của plugin như `pr-review-toolkit:code-reviewer` hay `feature-dev:code-reviewer`.

---

### Task 1: Dọn baseline (gitignore, lint, audit, Vite stable)

Mục tiêu: `main` hiện có 9 lỗi ESLint, 2 critical + 3 high trong `npm audit`, và chạy Vite `8.0.0-beta.16`. Mọi gate về sau đều cần baseline xanh.

**Files:**
- Modify: `.gitignore`
- Modify: `unijob-web/package.json`, `unijob-web/package-lock.json`
- Modify: `unijob-web/src/pages/JobList.tsx:24`, `unijob-web/src/pages/MyJobs.tsx:12,597`, `unijob-web/src/services/rating.service.ts:99`, `unijob-web/src/types/user.ts:26`
- Modify (eslint-disable kèm lý do): `unijob-web/src/pages/JobSearch.tsx:33`, `unijob-web/src/pages/Profile.tsx:70,87,102,125`

**Interfaces:** Không có. Đây là task nền.

- [ ] **Step 1: Sửa `.gitignore` ở root.** Xoá dòng `.claude/` trong khối `# IDE` và thêm cuối file:

```gitignore
# Claude Code (shared config is committed; personal overrides are not)
.claude/settings.local.json

# Agent pipeline
.worktrees/
ci/last-run.json
unijob-web/coverage/
*-debug.log
```

- [ ] **Step 2: Sửa 4 lỗi lint dễ.**

`unijob-web/src/pages/JobList.tsx:24`:
```ts
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(giờ|h)/);
```

`unijob-web/src/pages/MyJobs.tsx`: dòng 12 đổi thành
```ts
import { workerCancelJob, posterCancelJob, type CancelReason } from '@/services/cancel.service';
```
và dòng 597 `reason as any,` đổi thành
```ts
                  reason as CancelReason,
```

`unijob-web/src/services/rating.service.ts:99`:
```ts
  const updates: Record<string, unknown> = { [field]: true };
```
(`updateDoc` nhận `UpdateData<DocumentData>`, và `Record<string, unknown>` gán vào được. Dùng kiểu này để tránh lỗi gán computed key thành index signature.)

`unijob-web/src/types/user.ts:26`:
```ts
export type UserProfile = Pick<User, 'uid' | 'displayName' | 'photoURL' | 'faculty' | 'ratingScore' | 'totalRatings'>;
```

- [ ] **Step 3: Chặn có lý do 5 lỗi React Compiler.** Sửa thật các lỗi này đồng nghĩa với refactor trang, việc đó thuộc phần làm lại UI của sub-project B. Thêm comment ngay trên mỗi dòng lỗi (JobSearch.tsx:33, Profile.tsx:70, 87, 102):

```ts
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-in-effect; replace with TanStack Query in UI rebuild (sub-project B)
```

Và trên dòng `useMemo` của `trustScore` (Profile.tsx, khoảng dòng 125, nơi rule báo):

```ts
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- legacy optional-chain deps; fix in UI rebuild (sub-project B)
```

- [ ] **Step 4: Chạy lint, kỳ vọng 0 error.**

Run: `cd unijob-web && npx eslint .`
Expected: `✖ 1 problem (0 errors, 1 warning)` (chỉ còn warning `exhaustive-deps` ở MyJobs.tsx:363), exit code 0. Nếu rule báo ở dòng lệch so với comment, dời comment cho sát dòng được báo rồi chạy lại.

- [ ] **Step 5: Nâng Vite lên bản stable và vá audit.**

```bash
cd unijob-web
npm install -D vite@^8.3.2
npm pkg set overrides.vite='$vite'
npm audit fix
npm audit --omit=dev --audit-level=high
```
Expected: lệnh cuối exit 0 (`found 0 vulnerabilities` hoặc chỉ còn moderate/low). Nếu vẫn còn high/critical mà cần `--force`, **dừng** và báo lại gói nào kèm major version nào, không tự chạy `--force`.

- [ ] **Step 6: Kiểm build và typecheck.**

Run: `cd unijob-web && npx tsc -b && npx vite build`
Expected: cả hai exit 0.

- [ ] **Step 7: Commit.** Hook chưa được cài nên chưa cần chạy CI.

```bash
git add .gitignore unijob-web/package.json unijob-web/package-lock.json unijob-web/src
git commit -m "chore: clean lint baseline, upgrade vite to stable, fix audit findings"
```

---

### Task 2: Nền unit test (Vitest) + tách `fees.ts`

**Files:**
- Create: `unijob-web/vitest.config.ts`
- Create: `unijob-web/src/lib/fees.ts`, `unijob-web/src/lib/fees.test.ts`
- Modify: `unijob-web/src/services/payment.service.ts:17-31`
- Modify: `unijob-web/tsconfig.node.json` (`include`)
- Modify: `unijob-web/package.json` (scripts, devDeps)

**Interfaces:**
- Produces: `calculatePlatformFee(amount: number): number` trong `@/lib/fees` (`payment.service` re-export, nên các import cũ vẫn chạy). Vitest có 2 project tên `unit` (`src/**/*.test.ts`) và `rules` (`tests/rules/**/*.test.ts`). Coverage ghi ra `unijob-web/coverage/coverage-summary.json`.

- [ ] **Step 1: Cài Vitest.**

```bash
cd unijob-web && npm install -D vitest@^5.0.3 @vitest/coverage-v8@^5.0.3
```

- [ ] **Step 2: Tạo `unijob-web/vitest.config.ts`.**

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
```

Sửa `unijob-web/tsconfig.node.json`: `"include": ["vite.config.ts", "vitest.config.ts", "tests"]`.

Thêm scripts vào `unijob-web/package.json`:
```bash
npm pkg set scripts.test="vitest run --project unit" scripts.test:watch="vitest --project unit" scripts.test:rules="firebase emulators:exec --only firestore --project demo-unijob \"vitest run --project rules\""
```

- [ ] **Step 3: Viết test fail `unijob-web/src/lib/fees.test.ts`.**

```ts
import { describe, expect, it } from 'vitest';
import { calculatePlatformFee } from '@/lib/fees';

describe('calculatePlatformFee', () => {
  it('is 0 for volunteer and non-positive amounts', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(-50_000)).toBe(0);
  });

  it('charges 3% below 200,000', () => {
    expect(calculatePlatformFee(100_000)).toBe(3_000);
    expect(calculatePlatformFee(199_999)).toBe(6_000);
  });

  it('charges 5% from 200,000 up to and including 1,000,000', () => {
    expect(calculatePlatformFee(200_000)).toBe(10_000);
    expect(calculatePlatformFee(1_000_000)).toBe(50_000);
  });

  it('charges 4% above 1,000,000', () => {
    expect(calculatePlatformFee(1_000_001)).toBe(40_000);
    expect(calculatePlatformFee(2_500_000)).toBe(100_000);
  });

  it('rounds to whole VND', () => {
    expect(Number.isInteger(calculatePlatformFee(123_457))).toBe(true);
  });
});
```

- [ ] **Step 4: Chạy để thấy fail.**

Run: `cd unijob-web && npx vitest run --project unit`
Expected: FAIL, `Failed to resolve import "@/lib/fees"`.

- [ ] **Step 5: Tạo `unijob-web/src/lib/fees.ts`** (chuyển nguyên logic từ payment.service).

```ts
/**
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

Trong `unijob-web/src/services/payment.service.ts`, xoá block JSDoc và hàm `calculatePlatformFee` (dòng 17–31), thêm sau dòng `import { updateJob } …`:

```ts
import { calculatePlatformFee } from '@/lib/fees';

export { calculatePlatformFee };
```

- [ ] **Step 6: Chạy test, typecheck, lint.**

Run: `cd unijob-web && npx vitest run --project unit --coverage && npx tsc -b && npx eslint .`
Expected: 5 test pass. Coverage summary in ra `src/lib/fees.ts` 100% lines. `tsc` và `eslint` exit 0.

- [ ] **Step 7: Commit.**

```bash
git add unijob-web/vitest.config.ts unijob-web/tsconfig.node.json unijob-web/package.json unijob-web/package-lock.json unijob-web/src/lib/fees.ts unijob-web/src/lib/fees.test.ts unijob-web/src/services/payment.service.ts
git commit -m "test: add vitest with unit/rules projects and cover platform fee tiers"
```

---

### Task 3: Test Firestore rules trên emulator (ghi lại hành vi hiện tại + lỗ hổng)

**Files:**
- Modify: `unijob-web/firebase.json` (thêm `emulators`)
- Modify: `unijob-web/package.json` (devDeps)
- Create: `unijob-web/tests/rules/firestore.rules.test.ts`

**Interfaces:**
- Consumes: Vitest project `rules` (Task 2).
- Produces: lệnh `npx firebase emulators:exec --only firestore --project demo-unijob "npx vitest run --project rules"`, chạy từ `unijob-web/`. Task 4 sẽ gọi đúng chuỗi này. Các test `it.fails('KNOWN HOLE …')` là danh sách lỗ hổng chuyển sang sub-project B.

- [ ] **Step 1: Cài thư viện.**

```bash
cd unijob-web && npm install -D @firebase/rules-unit-testing@^5.0.2 firebase-tools@^15.32.1
```

- [ ] **Step 2: Thêm block `emulators` vào `unijob-web/firebase.json`** (cùng cấp `firestore`, `hosting`):

```json
  "emulators": {
    "singleProjectMode": true,
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
```

- [ ] **Step 3: Viết `unijob-web/tests/rules/firestore.rules.test.ts`.**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-unijob',
    firestore: { rules: readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', displayName: 'Alice' });
    await setDoc(doc(db, 'users/bob'), { uid: 'bob', displayName: 'Bob' });
    await setDoc(doc(db, 'jobs/job1'), {
      title: 'Nhập liệu',
      postedBy: 'poster',
      applicants: ['carol'],
      status: 'open',
    });
    await setDoc(doc(db, 'payments/pay1'), {
      jobId: 'job1',
      payerId: 'poster',
      payeeId: 'worker',
      amount: 100_000,
      status: 'held',
    });
    await setDoc(doc(db, 'jobCompletions/c1'), {
      jobId: 'job1',
      workerConfirmed: false,
      posterConfirmed: false,
      status: 'pending',
    });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'alice', message: 'hi', read: false });
  });
});

describe('users', () => {
  it('signed-out users cannot read profiles', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
  it('a user can update their own profile', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { displayName: 'A' }));
  });
  it("a user cannot update someone else's profile", async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/bob'), { displayName: 'pwned' }));
  });
});

describe('jobs', () => {
  it('signed-in users can read jobs; signed-out cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'jobs/job1')));
    await assertFails(getDoc(doc(anon(), 'jobs/job1')));
  });
  it('the poster can edit their job', async () => {
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/job1'), { title: 'Mới' }));
  });
  it('a non-poster cannot edit job fields other than applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { title: 'pwned' }));
  });
  it('a non-poster can apply (applicants + updatedAt only)', async () => {
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: ['carol', 'alice'], updatedAt: 1 }),
    );
  });
  it.fails('KNOWN HOLE (fix in B): job create must set postedBy to the caller', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/forged'), { title: 'x', postedBy: 'bob' }));
  });
  it.fails('KNOWN HOLE (fix in B): a non-poster cannot remove other applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: [] }));
  });
});

describe('applications', () => {
  it('a user can create an application for themselves', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'applications/a1'), { jobId: 'job1', applicantId: 'alice' }));
  });
  it('a user cannot create an application on behalf of someone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'applications/a2'), { jobId: 'job1', applicantId: 'bob' }));
  });
});

describe('payments', () => {
  it('a third party cannot read a payment', async () => {
    await assertFails(getDoc(doc(as('mallory'), 'payments/pay1')));
  });
  it('payer and payee can read the payment', async () => {
    await assertSucceeds(getDoc(doc(as('poster'), 'payments/pay1')));
    await assertSucceeds(getDoc(doc(as('worker'), 'payments/pay1')));
  });
  it.fails('KNOWN HOLE (fix in B): the payee cannot release escrow to themselves', async () => {
    await assertFails(updateDoc(doc(as('worker'), 'payments/pay1'), { status: 'released' }));
  });
  it.fails('KNOWN HOLE (fix in B): clients cannot create payments for other people', async () => {
    await assertFails(
      setDoc(doc(as('mallory'), 'payments/forged'), {
        jobId: 'job1', payerId: 'poster', payeeId: 'mallory', amount: 9_999_999, status: 'released',
      }),
    );
  });
});

describe('jobCompletions', () => {
  it.fails('KNOWN HOLE (fix in B): outsiders cannot confirm a completion', async () => {
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/c1'), { posterConfirmed: true, status: 'confirmed' }));
  });
});

describe('notifications', () => {
  it('the owner can read their notification; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications/n1')));
    await assertFails(getDoc(doc(as('bob'), 'notifications/n1')));
  });
  it.fails('KNOWN HOLE (fix in B): users cannot create notifications for other users', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/spam'), { userId: 'alice', message: 'spam', read: false }));
  });
});

describe('ratings', () => {
  it('a user can create a rating as themselves', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'ratings/r1'), { fromUserId: 'alice', toUserId: 'bob', score: 5 }));
  });
  it('a user cannot forge a rating from someone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'ratings/r2'), { fromUserId: 'bob', toUserId: 'alice', score: 5 }));
  });
});
```

- [ ] **Step 4: Chạy trên emulator.**

Run: `cd unijob-web && npx firebase emulators:exec --only firestore --project demo-unijob "npx vitest run --project rules"`
Expected: `Tests  20 passed (20)`, trong đó 6 test `KNOWN HOLE` được Vitest báo là expected fail. Exit 0.

Nếu một `KNOWN HOLE` **pass thật** (Vitest báo "Expect test to fail"), nghĩa là rules không lỏng như mình phân tích. Khi đó đổi test đó thành `it(...)` thường và ghi chú lại trong báo cáo task.

Nếu emulator không khởi động được do Java, chạy `java -version` để xác nhận ≥ 11.

- [ ] **Step 5: Commit.**

```bash
git add unijob-web/firebase.json unijob-web/package.json unijob-web/package-lock.json unijob-web/tests
git commit -m "test: add firestore rules tests on emulator, documenting known holes"
```

---

### Task 4: CI local (`scripts/ci-local.mjs`)

**Files:**
- Create: `scripts/ci/git.mjs`, `scripts/ci/git.test.mjs`
- Create: `scripts/ci/checks.mjs`, `scripts/ci/checks.test.mjs`
- Create: `scripts/ci-local.mjs`
- Create: `ci/coverage-legacy.json`, `ci/budget.json` (sinh bằng `--update-budget`)

**Interfaces:**
- Consumes: lệnh rules từ Task 3, Vitest projects từ Task 2.
- Produces:
  - `scripts/ci/git.mjs`: `git(cwd, args, env?) → string`, `repoRoot(cwd?) → string`, `workingTreeFingerprint(root) → string` (tree sha), `headTree(root) → string`, `mergeBase(root) → string`, `changedFiles(root, since) → string[]` (đường dẫn repo-relative, dùng `/`).
  - `scripts/ci/checks.mjs`: `COVERAGE_MIN = 70`, `BUDGET_TOLERANCE = 0.1`, `coverageViolations(changed, pctByFile, legacy) → {file, pct}[]`, `budgetCheck(current, baseline) → {ok, limit}`, `findSecrets(text) → string[]`, `toRepoRelative(abs, root) → string`.
  - CLI: `node scripts/ci-local.mjs [--quick|--full] [--update-budget]`, ghi `<repoRoot>/ci/last-run.json` = `{ mode: 'quick'|'full', fingerprint, ok, finishedAt, gates: [{ name, ok, skipped, summary, files, ms }] }`, exit 1 khi có gate fail.

- [ ] **Step 1: Viết test fail `scripts/ci/git.test.mjs`.**

```js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { changedFiles, git, headTree, workingTreeFingerprint } from './git.mjs';

let repo;
before(() => {
  repo = mkdtempSync(join(tmpdir(), 'uj-git-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@example.com']);
  git(repo, ['config', 'user.name', 'T']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'init']);
});
after(() => rmSync(repo, { recursive: true, force: true }));

test('clean tree: fingerprint equals HEAD tree', () => {
  assert.equal(workingTreeFingerprint(repo), headTree(repo));
});

test('ignored files do not change the fingerprint', () => {
  const before = workingTreeFingerprint(repo);
  writeFileSync(join(repo, 'ignored.txt'), 'noise');
  assert.equal(workingTreeFingerprint(repo), before);
});

test('modified and untracked files change the fingerprint; committing them makes it equal HEAD tree again', () => {
  const clean = workingTreeFingerprint(repo);
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  writeFileSync(join(repo, 'new.txt'), 'new\n');
  const dirty = workingTreeFingerprint(repo);
  assert.notEqual(dirty, clean);
  assert.deepEqual(changedFiles(repo, 'HEAD').sort(), ['a.txt', 'new.txt']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'change']);
  assert.equal(headTree(repo), dirty);
});

test('fingerprint does not touch the real index', () => {
  writeFileSync(join(repo, 'b.txt'), 'b\n');
  workingTreeFingerprint(repo);
  assert.equal(git(repo, ['diff', '--cached', '--name-only']), '');
});
```

- [ ] **Step 2: Chạy để thấy fail.**

Run: `node --test scripts/ci/git.test.mjs`
Expected: FAIL, `Cannot find module '.../scripts/ci/git.mjs'`.

- [ ] **Step 3: Viết `scripts/ci/git.mjs`.**

```js
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function git(cwd, args, env) {
  return execFileSync('git', args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

/**
 * Tree sha of the whole working tree (tracked + untracked, minus ignored), built in a
 * throwaway index so the real index is untouched. Committing exactly this state yields
 * a HEAD whose tree has the same sha — that is what lets the push guard compare them.
 */
export function workingTreeFingerprint(root) {
  const index = join(tmpdir(), `uj-fp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(root, ['read-tree', 'HEAD'], env);
    git(root, ['add', '-A'], env);
    return git(root, ['write-tree'], env);
  } finally {
    rmSync(index, { force: true });
  }
}

export function headTree(root) {
  return git(root, ['rev-parse', 'HEAD^{tree}']);
}

export function mergeBase(root) {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(root, ['merge-base', 'HEAD', ref]);
    } catch {
      // ref missing (fresh clone without origin, or no local main) — try the next one
    }
  }
  return git(root, ['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0];
}

export function changedFiles(root, since) {
  const tracked = git(root, ['diff', '--name-only', since]).split('\n');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}
```

- [ ] **Step 4: Chạy test git.**

Run: `node --test scripts/ci/git.test.mjs`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Viết test fail `scripts/ci/checks.test.mjs`.**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetCheck, coverageViolations, findSecrets, toRepoRelative } from './checks.mjs';

test('coverage: new in-scope file below 70% is a violation', () => {
  const v = coverageViolations(['unijob-web/src/services/new.service.ts'], { 'unijob-web/src/services/new.service.ts': 40 }, []);
  assert.deepEqual(v, [{ file: 'unijob-web/src/services/new.service.ts', pct: 40 }]);
});

test('coverage: file missing from the report counts as 0%', () => {
  const v = coverageViolations(['unijob-web/src/lib/x.ts'], {}, []);
  assert.deepEqual(v, [{ file: 'unijob-web/src/lib/x.ts', pct: 0 }]);
});

test('coverage: legacy files, test files, out-of-scope files and passing files are ignored', () => {
  const changed = [
    'unijob-web/src/services/job.service.ts',
    'unijob-web/src/lib/fees.test.ts',
    'unijob-web/src/pages/Home.tsx',
    'unijob-web/src/lib/fees.ts',
  ];
  const v = coverageViolations(changed, { 'unijob-web/src/lib/fees.ts': 100 }, ['unijob-web/src/services/job.service.ts']);
  assert.deepEqual(v, []);
});

test('coverage: functions source is in scope', () => {
  const v = coverageViolations(['unijob-web/functions/src/escrow.ts'], { 'unijob-web/functions/src/escrow.ts': 69.9 }, []);
  assert.equal(v.length, 1);
});

test('budget: allows up to +10%, rejects above', () => {
  assert.deepEqual(budgetCheck(110, 100), { ok: true, limit: 110 });
  assert.deepEqual(budgetCheck(111, 100), { ok: false, limit: 110 });
});

test('secrets: detects private keys and service accounts, ignores normal code', () => {
  const pk = '-----BEGIN ' + 'PRIVATE KEY-----\nabc';
  const sa = '{ "type": "service' + '_account" }';
  const gh = 'ghp' + '_' + 'a'.repeat(36);
  assert.deepEqual(findSecrets(pk), ['private-key']);
  assert.deepEqual(findSecrets(sa), ['gcp-service-account']);
  assert.deepEqual(findSecrets(gh), ['github-token']);
  assert.deepEqual(findSecrets('const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;'), []);
});

test('toRepoRelative normalises separators', () => {
  assert.equal(toRepoRelative('C:\\r\\unijob-web\\src\\a.ts'.replace(/\\/g, '/'), 'C:/r'), 'unijob-web/src/a.ts');
});
```

- [ ] **Step 6: Chạy để thấy fail.**

Run: `node --test scripts/ci/checks.test.mjs`
Expected: FAIL, `Cannot find module '.../scripts/ci/checks.mjs'`.

- [ ] **Step 7: Viết `scripts/ci/checks.mjs`.**

```js
import { relative, sep } from 'node:path';

export const COVERAGE_MIN = 70;
export const BUDGET_TOLERANCE = 0.1;

const COVERAGE_SCOPE = [
  /^unijob-web\/src\/services\/.+\.ts$/,
  /^unijob-web\/src\/lib\/.+\.ts$/,
  /^unijob-web\/functions\/src\/.+\.ts$/,
];

/** Changed in-scope source files (not legacy, not tests) whose line coverage is under the minimum. */
export function coverageViolations(changed, pctByFile, legacy) {
  return changed
    .filter((f) => COVERAGE_SCOPE.some((re) => re.test(f)))
    .filter((f) => !f.endsWith('.test.ts') && !legacy.includes(f))
    .map((f) => ({ file: f, pct: pctByFile[f] ?? 0 }))
    .filter((x) => x.pct < COVERAGE_MIN);
}

export function budgetCheck(currentBytes, baselineBytes) {
  const limit = Math.round(baselineBytes * (1 + BUDGET_TOLERANCE));
  return { ok: currentBytes <= limit, limit };
}

const SECRET_PATTERNS = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'gcp-service-account', re: /"type"\s*:\s*"service_account"/ },
  { name: 'stripe-live-key', re: /\b[sr]k_live_[0-9a-zA-Z]{20,}/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

export function findSecrets(text) {
  return SECRET_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

export function toRepoRelative(absPath, root) {
  return relative(root, absPath).split(sep).join('/').replace(/\\/g, '/');
}
```

- [ ] **Step 8: Chạy test checks.**

Run: `node --test scripts/ci/checks.test.mjs`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 9: Viết `scripts/ci-local.mjs`.**

```js
#!/usr/bin/env node
// UniJob local CI. Same script runs in GitHub Actions. See CLAUDE.md "CI".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { budgetCheck, coverageViolations, findSecrets, toRepoRelative } from './ci/checks.mjs';
import { changedFiles, mergeBase, repoRoot, workingTreeFingerprint } from './ci/git.mjs';

const mode = process.argv.includes('--full') ? 'full' : 'quick';
const updateBudget = process.argv.includes('--update-budget');
const root = repoRoot();
const web = join(root, 'unijob-web');
let fingerprint = workingTreeFingerprint(root);

const base = mode === 'full' ? mergeBase(root) : 'HEAD';
const changed = changedFiles(root, base).filter((f) => existsSync(join(root, f)));
const webChanged = changed.filter((f) => f.startsWith('unijob-web/')).map((f) => f.slice('unijob-web/'.length));
const webTs = webChanged.filter((f) => /\.(ts|tsx)$/.test(f));
const webSrc = webTs.filter((f) => f.startsWith('src/'));
const toolingChanged = changed.some((f) => f.startsWith('scripts/') || f.startsWith('.claude/'));
const quote = (f) => `"${f}"`;

function run(cmd, cwd = web) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', CI: '1' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, tail: out.trim().split('\n').slice(-40).join('\n') };
}

const gates = [];
function gate(name, fn) {
  const started = performance.now();
  let res;
  try {
    res = fn();
  } catch (err) {
    res = { ok: false, summary: String(err?.stack ?? err) };
  }
  const entry = { name, ok: res.ok, skipped: Boolean(res.skipped), summary: res.summary ?? '', files: res.files ?? [], ms: Math.round(performance.now() - started) };
  gates.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${name}${entry.skipped ? ' (skipped)' : ''}  ${entry.ms}ms`);
  if (!entry.ok) console.log(entry.summary.split('\n').map((l) => `      ${l}`).join('\n'));
}

console.log(`ci-local --${mode}  (${changed.length} changed files vs ${base.slice(0, 12)})`);

gate('typecheck', () => {
  const r = run('npx tsc -b');
  return { ok: r.ok, summary: r.tail };
});

gate('lint', () => {
  if (mode === 'quick' && webTs.length === 0) return { ok: true, skipped: true, summary: 'no changed TS files' };
  const r = run(mode === 'full' ? 'npx eslint .' : `npx eslint ${webTs.map(quote).join(' ')}`);
  return { ok: r.ok, summary: r.tail, files: webTs };
});

gate('unit-tests', () => {
  if (mode === 'quick') {
    if (webSrc.length === 0) return { ok: true, skipped: true, summary: 'no changed src files' };
    const r = run(`npx vitest related --run --project unit --passWithNoTests ${webSrc.map(quote).join(' ')}`);
    return { ok: r.ok, summary: r.tail, files: webSrc };
  }
  const r = run('npx vitest run --project unit --coverage');
  return { ok: r.ok, summary: r.tail };
});

gate('tooling-tests', () => {
  if (mode === 'quick' && !toolingChanged) return { ok: true, skipped: true, summary: 'no tooling changes' };
  const r = run('node --test "scripts/**/*.test.mjs" ".claude/**/*.test.mjs"', root);
  return { ok: r.ok, summary: r.tail };
});

if (mode === 'full') {
  gate('coverage', () => {
    const summaryPath = join(web, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) return { ok: false, summary: 'coverage/coverage-summary.json missing — did unit-tests fail?' };
    const raw = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const pct = {};
    for (const [abs, v] of Object.entries(raw)) if (abs !== 'total') pct[toRepoRelative(abs, root)] = v.lines.pct;
    const legacy = JSON.parse(readFileSync(join(root, 'ci', 'coverage-legacy.json'), 'utf8'));
    const bad = coverageViolations(changed, pct, legacy);
    return {
      ok: bad.length === 0,
      summary: bad.length ? bad.map((b) => `${b.file}: ${b.pct}% < 70%`).join('\n') : 'changed in-scope files meet 70% lines',
      files: bad.map((b) => b.file),
    };
  });

  gate('rules-tests', () => {
    const r = run('npx firebase emulators:exec --only firestore --project demo-unijob "npx vitest run --project rules"');
    return { ok: r.ok, summary: r.tail };
  });

  gate('build', () => {
    const r = run('npx vite build');
    return { ok: r.ok, summary: r.tail };
  });

  gate('bundle-budget', () => {
    const assets = join(web, 'dist', 'assets');
    const entries = existsSync(assets) ? readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f)) : [];
    if (entries.length === 0) return { ok: false, summary: 'no dist/assets/index-*.js — did build fail?' };
    const bytes = Math.max(...entries.map((f) => gzipSync(readFileSync(join(assets, f))).length));
    const budgetPath = join(root, 'ci', 'budget.json');
    if (updateBudget) writeFileSync(budgetPath, `${JSON.stringify({ entryGzipBytes: bytes }, null, 2)}\n`);
    const { entryGzipBytes } = JSON.parse(readFileSync(budgetPath, 'utf8'));
    const { ok, limit } = budgetCheck(bytes, entryGzipBytes);
    return { ok, summary: `entry gzip ${bytes} B (baseline ${entryGzipBytes} B, limit ${limit} B)` };
  });

  gate('npm-audit', () => {
    const r = run('npm audit --omit=dev --audit-level=high');
    return { ok: r.ok, summary: r.tail };
  });

  gate('secret-scan', () => {
    const scannable = changed.filter((f) => statSync(join(root, f)).size < 1_000_000);
    const hits = [];
    for (const f of scannable) {
      for (const name of findSecrets(readFileSync(join(root, f), 'utf8'))) hits.push(`${f}: ${name}`);
    }
    let gitleaks = 'gitleaks skipped (docker unavailable)';
    const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    if (docker.status === 0 && scannable.length > 0) {
      const scanDir = mkdtempSync(join(tmpdir(), 'uj-scan-'));
      try {
        for (const f of scannable) {
          mkdirSync(dirname(join(scanDir, f)), { recursive: true });
          copyFileSync(join(root, f), join(scanDir, f));
        }
        const r = run(`docker run --rm -v "${scanDir}:/scan" ghcr.io/gitleaks/gitleaks:v8.21.2 dir /scan --no-banner --redact`, root);
        gitleaks = r.ok ? 'gitleaks: clean' : `gitleaks findings:\n${r.tail}`;
        if (!r.ok) hits.push('gitleaks: findings (see summary)');
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
    return { ok: hits.length === 0, summary: [...hits, gitleaks].join('\n'), files: hits.map((h) => h.split(':')[0]) };
  });
}

if (updateBudget) fingerprint = workingTreeFingerprint(root); // budget.json itself changed
const ok = gates.every((g) => g.ok);
mkdirSync(join(root, 'ci'), { recursive: true });
writeFileSync(
  join(root, 'ci', 'last-run.json'),
  `${JSON.stringify({ mode, fingerprint, ok, finishedAt: new Date().toISOString(), gates }, null, 2)}\n`,
);
console.log(ok ? `\nci-local --${mode}: ALL GREEN` : `\nci-local --${mode}: FAILED — details in ci/last-run.json`);
process.exit(ok ? 0 : 1);
```

- [ ] **Step 10: Tạo `ci/coverage-legacy.json`.** Đây là các file service/lib đã tồn tại và chưa có test. Bỏ file nào khỏi danh sách khi file đó đã có test đạt 70%.

```json
[
  "unijob-web/src/lib/constants.ts",
  "unijob-web/src/lib/firebase.ts",
  "unijob-web/src/lib/utils.ts",
  "unijob-web/src/services/auth.service.ts",
  "unijob-web/src/services/bookmark.service.ts",
  "unijob-web/src/services/cancel.service.ts",
  "unijob-web/src/services/cleanup.service.ts",
  "unijob-web/src/services/cv.service.ts",
  "unijob-web/src/services/gamification.service.ts",
  "unijob-web/src/services/job.service.ts",
  "unijob-web/src/services/notification.service.ts",
  "unijob-web/src/services/payment.service.ts",
  "unijob-web/src/services/rating.service.ts",
  "unijob-web/src/services/storage.service.ts",
  "unijob-web/src/services/suggest.service.ts",
  "unijob-web/src/services/user.service.ts",
  "unijob-web/src/services/workHistory.service.ts"
]
```

- [ ] **Step 11: Chạy full lần đầu và ghi baseline budget.**

Run: `node scripts/ci-local.mjs --full --update-budget`
Expected: in `PASS` cho cả 10 gate, kết thúc bằng `ci-local --full: ALL GREEN`. Tạo ra `ci/budget.json` với `entryGzipBytes` khoảng 300000. Dòng `secret-scan` báo `gitleaks: clean`, hoặc `skipped (docker unavailable)` nếu Docker Desktop đang tắt (chấp nhận được ở máy local).

Nếu gate nào FAIL, đọc `ci/last-run.json`, sửa nguyên nhân rồi chạy lại. **Không** nới ngưỡng.

- [ ] **Step 12: Chạy thử `--quick`.**

Run: `node scripts/ci-local.mjs --quick`
Expected: `ALL GREEN`. Gate `tooling-tests` chạy vì `scripts/` có thay đổi chưa commit, còn `lint`/`unit-tests` có thể báo skipped.

- [ ] **Step 13: Commit.**

```bash
git add scripts ci/budget.json ci/coverage-legacy.json
git commit -m "chore: add ci-local with quick/full gates, fingerprint and budgets"
```

---

### Task 5: Hooks và `.claude/settings.json`

**Files:**
- Create: `.claude/hooks/guard-commit.mjs`, `.claude/hooks/guard-commit.test.mjs`
- Create: `.claude/hooks/guard-secrets.mjs`, `.claude/hooks/guard-secrets.test.mjs`
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: `repoRoot`, `workingTreeFingerprint`, `headTree` từ `scripts/ci/git.mjs`, và định dạng `ci/last-run.json` (Task 4).
- Produces:
  - `parseGitCommand(command) → { kind: 'commit'|'push'|null, dir: string|null, messageFile: string|null }`
  - `evaluate({ command, cwd }, deps) → { block: boolean, reason?: string }`, với `deps = { repoRoot, readLastRun(root), workingTreeFingerprint, headTree, readFile }`
  - `isProtectedPath(path) → boolean`
  - Hook đọc JSON hook từ stdin. Khi chặn, exit code 2 và in lý do ra stderr.

- [ ] **Step 1: Viết test fail `.claude/hooks/guard-commit.test.mjs`.**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, parseGitCommand } from './guard-commit.mjs';

const deps = (over = {}) => ({
  repoRoot: (dir) => dir,
  readLastRun: () => ({ mode: 'quick', ok: true, fingerprint: 'T1' }),
  workingTreeFingerprint: () => 'T1',
  headTree: () => 'T1',
  readFile: () => '',
  ...over,
});

test('parseGitCommand: ignores non-commit commands', () => {
  assert.equal(parseGitCommand('git status').kind, null);
  assert.equal(parseGitCommand('echo "git commit"').kind, 'commit'); // conservative: still checked
});

test('parseGitCommand: reads -C and leading cd', () => {
  assert.deepEqual(parseGitCommand('git -C .worktrees/x commit -m "a"').dir, '.worktrees/x');
  assert.deepEqual(parseGitCommand('cd "C:/r/.worktrees/x" && git commit -m a').dir, 'C:/r/.worktrees/x');
  assert.equal(parseGitCommand('git push -u origin feat/x').kind, 'push');
  assert.equal(parseGitCommand('git commit -F msg.txt').messageFile, 'msg.txt');
});

test('blocks Co-Authored-By in the command', () => {
  const r = evaluate({ command: 'git commit -m "feat: x\n\nCo-Authored-By: Bot <b@x>"', cwd: '/r' }, deps());
  assert.equal(r.block, true);
  assert.match(r.reason, /Co-Authored-By/);
});

test('blocks Co-Authored-By inside a -F message file', () => {
  const r = evaluate({ command: 'git commit -F msg.txt', cwd: '/r' }, deps({ readFile: () => 'x\n\nco-authored-by: a <b>' }));
  assert.equal(r.block, true);
});

test('blocks commit without a CI run', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ readLastRun: () => null }));
  assert.equal(r.block, true);
  assert.match(r.reason, /ci-local\.mjs --quick/);
});

test('blocks commit when last CI failed', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ readLastRun: () => ({ mode: 'full', ok: false, fingerprint: 'T1' }) }));
  assert.equal(r.block, true);
});

test('blocks commit when code changed after CI', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ workingTreeFingerprint: () => 'T2' }));
  assert.equal(r.block, true);
  assert.match(r.reason, /changed since/);
});

test('allows commit when fingerprint matches (even for a partial git add)', () => {
  assert.equal(evaluate({ command: 'git add a.ts && git commit -m "feat: a"', cwd: '/r' }, deps()).block, false);
});

test('uses the worktree from -C to find CI results', () => {
  let seen;
  evaluate({ command: 'git -C .worktrees/x commit -m a', cwd: '/r' }, deps({ readLastRun: (root) => { seen = root; return { mode: 'quick', ok: true, fingerprint: 'T1' }; } }));
  assert.match(seen.replace(/\\/g, '/'), /\/r\/\.worktrees\/x$/);
});

test('push requires a green --full run matching HEAD tree', () => {
  assert.equal(evaluate({ command: 'git push -u origin feat/x', cwd: '/r' }, deps()).block, true); // quick only
  const full = () => ({ mode: 'full', ok: true, fingerprint: 'T1' });
  assert.equal(evaluate({ command: 'git push', cwd: '/r' }, deps({ readLastRun: full })).block, false);
  assert.equal(evaluate({ command: 'git push', cwd: '/r' }, deps({ readLastRun: full, headTree: () => 'T9' })).block, true);
});

test('not a git repo → allow (nothing to guard)', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/tmp' }, deps({ repoRoot: () => { throw new Error('not a repo'); } }));
  assert.equal(r.block, false);
});
```

- [ ] **Step 2: Chạy để thấy fail.**

Run: `node --test .claude/hooks/guard-commit.test.mjs`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Viết `.claude/hooks/guard-commit.mjs`.**

```js
#!/usr/bin/env node
// PreToolUse(Bash) guard: no Co-Authored-By; commit only after a green ci-local run on the
// exact working tree; push only after a green --full run on the exact HEAD tree.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headTree, repoRoot, workingTreeFingerprint } from '../../scripts/ci/git.mjs';

const ARG = String.raw`("[^"]+"|'[^']+'|\S+)`;
const unquote = (s) => (s ? s.replace(/^["']|["']$/g, '') : null);

export function parseGitCommand(command) {
  const m = command.match(new RegExp(String.raw`\bgit\s+(?:-C\s+${ARG}\s+)?(commit|push)\b`));
  if (!m) return { kind: null, dir: null, messageFile: null };
  let dir = unquote(m[1]);
  if (!dir) dir = unquote(command.match(new RegExp(String.raw`^\s*cd\s+${ARG}\s*&&`))?.[1]);
  const messageFile = unquote(command.match(new RegExp(String.raw`\s(?:-F|--file)\s+${ARG}`))?.[1]);
  return { kind: m[2], dir, messageFile };
}

const block = (reason) => ({ block: true, reason });

export function evaluate({ command, cwd }, deps) {
  const { kind, dir, messageFile } = parseGitCommand(command);
  if (!kind) return { block: false };

  const workdir = dir ? resolve(cwd, dir) : cwd;
  if (kind === 'commit') {
    const message = messageFile ? deps.readFile(resolve(workdir, messageFile)) : '';
    if (/co-authored-by/i.test(command) || /co-authored-by/i.test(message)) {
      return block('UniJob rule: commits must not contain a Co-Authored-By trailer. Remove it and retry.');
    }
  }

  let root;
  try {
    root = deps.repoRoot(workdir);
  } catch {
    return { block: false };
  }

  const last = deps.readLastRun(root);
  const needed = kind === 'push' ? '--full' : '--quick';
  if (!last) return block(`No CI result in ${root}/ci/last-run.json. Run: node scripts/ci-local.mjs ${needed}`);
  if (!last.ok) {
    const failed = (last.gates ?? []).filter((g) => !g.ok).map((g) => g.name).join(', ');
    return block(`Last ci-local run failed (${failed || 'see ci/last-run.json'}). Fix it and re-run node scripts/ci-local.mjs ${needed}`);
  }

  if (kind === 'commit') {
    if (last.fingerprint !== deps.workingTreeFingerprint(root)) {
      return block('Code changed since the last ci-local run. Re-run: node scripts/ci-local.mjs --quick');
    }
    return { block: false };
  }

  if (last.mode !== 'full') return block('Push needs a green full run. Run: node scripts/ci-local.mjs --full');
  if (last.fingerprint !== deps.headTree(root)) {
    return block('HEAD is not the tree that ci-local --full verified (uncommitted changes or new commits). Commit everything, then re-run --full.');
  }
  return { block: false };
}

const realDeps = {
  repoRoot,
  workingTreeFingerprint,
  headTree,
  readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : ''),
  readLastRun: (root) => {
    const p = join(root, 'ci', 'last-run.json');
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  if (input.tool_name === 'Bash' && typeof input.tool_input?.command === 'string') {
    const verdict = evaluate({ command: input.tool_input.command, cwd: input.cwd ?? process.cwd() }, realDeps);
    if (verdict.block) {
      process.stderr.write(`[guard-commit] ${verdict.reason}\n`);
      process.exit(2);
    }
  }
}
```

- [ ] **Step 4: Chạy test guard-commit.**

Run: `node --test .claude/hooks/guard-commit.test.mjs`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 5: Viết test fail `.claude/hooks/guard-secrets.test.mjs`.**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isProtectedPath } from './guard-secrets.mjs';

test('protects env files but not examples', () => {
  assert.equal(isProtectedPath('C:\\r\\unijob-web\\.env.local'), true);
  assert.equal(isProtectedPath('/r/.env'), true);
  assert.equal(isProtectedPath('/r/.env.production'), true);
  assert.equal(isProtectedPath('/r/unijob-web/.env.local.example'), false);
});

test('protects service accounts and key material', () => {
  assert.equal(isProtectedPath('/r/unijob-web/scripts/service-account.json'), true);
  assert.equal(isProtectedPath('/r/keys/server.pem'), true);
  assert.equal(isProtectedPath('/r/keys/app.p12'), true);
});

test('allows normal source files', () => {
  assert.equal(isProtectedPath('/r/unijob-web/src/lib/env.ts'), false);
  assert.equal(isProtectedPath('/r/docs/environment.md'), false);
});
```

- [ ] **Step 6: Chạy để thấy fail.**

Run: `node --test .claude/hooks/guard-secrets.test.mjs`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 7: Viết `.claude/hooks/guard-secrets.mjs`.**

```js
#!/usr/bin/env node
// PreToolUse(Write|Edit|MultiEdit) guard: agents never write secrets files.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isProtectedPath(p) {
  const name = p.replace(/\\/g, '/').split('/').pop() ?? '';
  if (/^\.env(\..+)?$/.test(name) && !name.endsWith('.example')) return true;
  if (/service-account.*\.json$/i.test(name)) return true;
  if (/\.(pem|p12|key)$/i.test(name)) return true;
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target === 'string' && isProtectedPath(target)) {
    process.stderr.write(`[guard-secrets] Writing ${target} is blocked: secrets are managed by humans only. Use the .example file instead.\n`);
    process.exit(2);
  }
}
```

- [ ] **Step 8: Chạy test guard-secrets.**

Run: `node --test .claude/hooks/guard-secrets.test.mjs`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 9: Thử hook thật bằng stdin** (chạy trong Git Bash, từ root repo).

```bash
echo '{"tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"git commit -m \"x\n\nCo-Authored-By: a <b>\""}}' | node .claude/hooks/guard-commit.mjs; echo "exit=$?"
echo '{"tool_name":"Write","tool_input":{"file_path":"unijob-web/.env.local"}}' | node .claude/hooks/guard-secrets.mjs; echo "exit=$?"
echo '{"tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"git status"}}' | node .claude/hooks/guard-commit.mjs; echo "exit=$?"
```
Expected: hai lệnh đầu in lý do `[guard-…]` và `exit=2`, lệnh thứ ba ra `exit=0`.

- [ ] **Step 10: Tạo `.claude/settings.json`.**

```json
{
  "permissions": {
    "allow": [
      "Bash(node scripts/ci-local.mjs:*)",
      "Bash(node --test:*)",
      "Bash(npm ci:*)",
      "Bash(npm run:*)",
      "Bash(npx vitest:*)",
      "Bash(npx tsc:*)",
      "Bash(npx eslint:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git rev-parse:*)",
      "Bash(git worktree list:*)",
      "Bash(gh pr view:*)",
      "Bash(gh pr list:*)",
      "Bash(gh pr checks:*)"
    ],
    "deny": [
      "Read(./unijob-web/.env.local)",
      "Read(**/service-account*.json)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-commit.mjs\"" }]
      },
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-secrets.mjs\"" }]
      }
    ]
  }
}
```

- [ ] **Step 11: Chạy CI quick rồi commit.** Từ bước này hook đã có hiệu lực.

```bash
node scripts/ci-local.mjs --quick
git add .claude/settings.json .claude/hooks
git commit -m "chore: add commit/push and secrets guard hooks"
```
Expected: CI `ALL GREEN` (tooling-tests chạy 4 file test), commit thành công. Nếu session Claude chưa nạp hook mới thì commit vẫn chạy bình thường. Hook sẽ có hiệu lực ở session sau, hoặc sau khi mở `/hooks`.

---

### Task 6: Bảy agent `.claude/agents/uj-*.md`

**Files:** Create 7 file dưới `.claude/agents/`.

**Interfaces:**
- Produces: các agentType `uj-product-strategist`, `uj-architect-planner`, `uj-implementer`, `uj-code-reviewer`, `uj-security-auditor`, `uj-ci-runner`, `uj-release-manager`. Workflow (Task 7) gọi 4 agent build bằng đúng tên này. Commands (Task 8) gọi 3 agent còn lại.
- Hợp đồng đầu ra mà workflow ép bằng schema:
  - Implementer trả `{status:'done'|'blocked', baseSha, headSha, files[], summary, blockedReason?}`.
  - Reviewer và auditor trả `{findings:[{severity, confidence, file, line, issue, suggestedFix}]}`.
  - ci-runner trả `{ok, failures:[{gate, cause, files[]}]}`.

- [ ] **Step 1: `.claude/agents/uj-product-strategist.md`**

```markdown
---
name: uj-product-strategist
description: UniJob product strategist. Use for /uj-brainstorm — turns a rough idea into an approved-ready spec in docs/specs/. Does not write code.
tools: Read, Glob, Grep, Write, Skill, WebSearch
model: opus
---

You are the product strategist for UniJob, a real campus task marketplace for HCMUT (students, lecturers, clubs) built on React + Firebase.

Your job: turn an idea into a written spec that a planner can break into tasks.

How you work:
1. Invoke the `superpowers:brainstorming` skill and follow it. The architectural path is the default for anything that touches data models, Firestore rules, Cloud Functions, payments, or more than one page.
2. Read the relevant code before proposing anything. Cite files as `path:line`.
3. Judge every proposal against "real users at a real university": abuse cases (fake jobs, spam, payment fraud), privacy of student data, Vietnamese UI copy, mobile-first.
4. Money, escrow, reputation/XP, completion status and notifications for other users must be written server-side (Cloud Functions / Admin SDK), never trusted from the client. Say so in the spec when relevant.
5. Write the spec to `docs/specs/YYYY-MM-DD-<topic>.md` with front matter `status: draft`. Sections: Context & goal, Decisions, Out of scope, Design (data model, rules, functions, UI), Error handling, Testing (unit, rules, functions, manual), Risks.
6. Stop after writing. Never set `status: approved` yourself — only the human does that (gate 1).

You may only write inside `docs/specs/`.
```

- [ ] **Step 2: `.claude/agents/uj-architect-planner.md`**

```markdown
---
name: uj-architect-planner
description: UniJob planner. Use for /uj-plan — converts an approved spec into a task-by-task TDD plan in docs/plans/ that the uj-build workflow can execute.
tools: Read, Glob, Grep, Write, Skill
model: opus
---

You turn an **approved** spec (`status: approved` in its front matter) into an implementation plan. If the spec is not approved, refuse and say so.

How you work:
1. Invoke the `superpowers:writing-plans` skill and follow it, with these UniJob overrides:
   - Save to `docs/plans/YYYY-MM-DD-<topic>.md` with front matter `status: draft`, `spec: <path>`, `branch: <feat|fix|chore>/<topic>`.
   - Every task heading is exactly `### Task N: <title>`. The uj-build workflow parses this format.
   - Each task must be completable by one implementer in one sitting and end with a green `node scripts/ci-local.mjs --quick` and a checkpoint commit.
   - Firestore/Storage rule changes come with tests in `unijob-web/tests/rules/`. Cloud Functions come with tests run on the emulator.
   - New service/lib/functions files need ≥70% line coverage (see `ci/coverage-legacy.json` for the legacy exemptions).
2. Use `feature-dev:code-architect` thinking: follow existing patterns in `unijob-web/src` (services own Firestore access, pages stay thin, types in `src/types`).
3. Stop after writing. Never set `status: approved` yourself (gate 2).

You may only write inside `docs/plans/`.
```

- [ ] **Step 3: `.claude/agents/uj-implementer.md`**

```markdown
---
name: uj-implementer
description: UniJob implementer. The only agent allowed to change code. Implements one plan task (or one batch of review fixes) with TDD inside a given worktree and makes a checkpoint commit.
tools: Read, Edit, Write, Bash, Glob, Grep, Skill
model: sonnet
---

You implement exactly one task from an approved plan, or fix exactly the findings you are given. Nothing else.

Rules:
- Work ONLY inside the worktree path in your prompt. Use absolute paths, and use `git -C <worktree>` for git.
- First run `git -C <worktree> rev-parse HEAD` and report it as `baseSha`.
- Invoke `superpowers:test-driven-development`: failing test → see it fail → minimal code → see it pass. For bugs, use `superpowers:systematic-debugging` before changing code.
- Stay in scope. If the task is ambiguous, contradicts the code, or needs changes outside its listed files, STOP and return `status: "blocked"` with `blockedReason`. Do not improvise.
- Before committing, run `node scripts/ci-local.mjs --quick` from the worktree root until it is green. If it is red, read `ci/last-run.json` and fix the cause.
- Commit with a Conventional Commit message ending in the task marker, e.g. `feat: add escrow release function [task:3]`. NEVER add a Co-Authored-By trailer (a hook blocks it anyway).
- Never edit `.env*`, service-account files, `ci/budget.json`, or `ci/coverage-legacy.json` (except removing a file you just brought to ≥70% coverage).
- Never weaken a test, a rule, or a CI threshold to get green.

Return the structured result: `status`, `baseSha`, `headSha`, `files`, `summary` (2–4 sentences of what changed and how it was verified), and `blockedReason` when blocked.
```

- [ ] **Step 4: `.claude/agents/uj-code-reviewer.md`**

```markdown
---
name: uj-code-reviewer
description: UniJob code reviewer. Read-only. Reviews a git diff range in a worktree for correctness bugs, regressions and plan/spec mismatches, and returns structured findings with confidence scores.
tools: Read, Glob, Grep, Bash
model: opus
---

You review one diff range (`git -C <worktree> diff <base>..HEAD`) against the plan task and the spec. You never modify files. Use Bash only for read-only git commands and reading test output.

Look for, in order:
1. Logic bugs and broken edge cases (empty lists, missing docs, null Firestore timestamps, Vietnamese text/diacritics, time zones for deadlines).
2. Regressions in callers of changed functions. Grep for every caller.
3. Behaviour that does not match the task or spec.
4. Tests that do not actually exercise the change, or that assert implementation details.
5. Silent failures: swallowed errors, `catch {}` without handling, toasts that hide data loss.

For every finding give: `severity` (critical | high | medium | low), `confidence` (0–100: how sure you are that this is real and reachable), `file`, `line`, `issue` (the concrete failure scenario, as input → wrong result), and `suggestedFix`.

Calibrate: ≥80 only when you traced the path and can describe the exact failing input. Style nits are `low`. Do not report things the linter or typechecker already enforce. An empty findings list is a valid, good answer.
```

- [ ] **Step 5: `.claude/agents/uj-security-auditor.md`**

```markdown
---
name: uj-security-auditor
description: UniJob security auditor. Read-only. Reviews a diff range for Firebase rules gaps, trust-boundary violations, auth/validation holes, secret exposure and XSS. Returns structured findings.
tools: Read, Glob, Grep, Bash
model: opus
---

You audit one diff range (`git -C <worktree> diff <base>..HEAD`) plus any code it touches. You never modify files.

Checklist (UniJob / Firebase):
1. Every `match` block in `unijob-web/firestore.rules` and `storage.rules` that changed has tests in `unijob-web/tests/rules/` covering both allow and deny.
2. The client must not write trusted fields: payment `amount`/`status`/`netAmount`/`platformFee`, `postedBy`, roles, reputation/XP/badges, `completedAt`/completion `status`, notifications addressed to other users. These belong to Cloud Functions / Admin SDK.
3. Cloud Functions check `request.auth`, validate input with an explicit schema, enforce ownership, and are idempotent for money movements (idempotency key or transaction).
4. No secrets in source or bundle. `VITE_*` values are public by design; anything else that looks like a key is a finding. No service-account JSON in the repo.
5. No `dangerouslySetInnerHTML`, `eval` or unsanitised URLs built from user data. Uploads check content type and size.
6. Queries do not leak other users' private data (applications, payments, notifications).
7. New dependencies: check that they are well known and needed.

Report findings in the same format as the code reviewer: `severity`, `confidence`, `file`, `line`, `issue` (attacker action → impact), `suggestedFix`. Use `critical` for anything that moves money or reputation, or exposes private data, without authorization. An empty list is a valid answer.
```

- [ ] **Step 6: `.claude/agents/uj-ci-runner.md`**

```markdown
---
name: uj-ci-runner
description: UniJob CI runner. Runs scripts/ci-local.mjs in a worktree and explains failures. Never edits code.
tools: Read, Bash
model: haiku
---

Run `node scripts/ci-local.mjs <mode>` from the worktree root given in your prompt (default `--full`). Then read `ci/last-run.json`.

Return:
- `ok`: the `ok` field from `ci/last-run.json`.
- `failures`: one entry per failed gate, with `gate`, `cause` (one or two sentences naming the root cause, e.g. "rules test 'payee cannot release escrow' fails because …", not just "tests failed"), and `files` (the files to fix).

Do not edit, stage or commit anything. Do not re-run more than once to rule out a flake. If it fails twice the same way, it is real.
```

- [ ] **Step 7: `.claude/agents/uj-release-manager.md`**

```markdown
---
name: uj-release-manager
description: UniJob release manager. Use for /uj-ship — squashes checkpoint commits, runs full CI, updates CHANGELOG, and after human approval pushes and opens a PR assigned to the owner.
tools: Read, Edit, Bash, Skill
model: sonnet
---

You prepare and ship one feature branch from its worktree.

Hard rules:
- NEVER add a `Co-Authored-By` trailer. NEVER add "Generated with Claude Code" or any AI footer to the PR.
- Every PR: `gh pr create --base main --assignee @me` (the owner is HieNguyen08).
- Do not push before the human has explicitly approved the summary (gate 3). The command that invoked you handles the question. If you were not told "approved", stop after preparing.

Steps:
1. `base=$(git -C <wt> merge-base main HEAD)`. Read `git log --format='%s' $base..HEAD` and the run report in `docs/runs/`.
2. Update `CHANGELOG.md` under `## [Unreleased]` with user-facing changes (Vietnamese is fine).
3. Run `node scripts/ci-local.mjs --full` in the worktree. It must be green; if not, stop and report. Order matters: CI must see the final tree, including CHANGELOG, or the commit/push hooks will block.
4. Squash without changing any file: `git -C <wt> reset --soft $base`, then create 1–3 Conventional Commits grouped by intent (for example `feat: …`, then `test: …`). Remove `[task:N]` markers. Because the working tree is unchanged, the full-run fingerprint still matches and the final HEAD tree equals it.
5. Prepare a PR body from `.github/pull_request_template.md`: Summary, Spec/Plan links, CI evidence (gate list from `ci/last-run.json`), Security notes (from the run report), Follow-ups.
6. After approval: `git -C <wt> push -u origin <branch>`, then `gh pr create --base main --head <branch> --assignee @me --title "<conventional title>" --body-file <tmpfile>`. Return the PR URL.
```

- [ ] **Step 8: Validate.** Dispatch agent `plugin-dev:plugin-validator` with the prompt: "Validate the agent definitions in `.claude/agents/uj-*.md` of this project (frontmatter fields name/description/tools/model, valid tool names, no conflicting instructions). Report problems only." Sửa mọi lỗi được báo.

- [ ] **Step 9: Commit.**

```bash
node scripts/ci-local.mjs --quick
git add .claude/agents
git commit -m "chore: add uj-* agent team definitions"
```

---

### Task 7: Workflow `uj-build` + test logic vòng lặp

**Files:**
- Create: `.claude/workflows/uj-build.js`
- Create: `scripts/ci/uj-build.workflow.test.mjs`

**Interfaces:**
- Consumes: các agentType ở Task 6, cùng `pr-review-toolkit:pr-test-analyzer` và `pr-review-toolkit:silent-failure-hunter`.
- Produces: workflow tên `uj-build` với `args = { worktree: string, plan: string, branch: string, tasks: [{id: number, title: string}], maxRounds?: number }`. Giá trị trả về:
  `{ status: 'done'|'blocked'|'needs-human'|'error', stoppedAt?, reason?, blocking?, tasks: [{id, title, rounds, fixed, status}], followUps: Finding[], ci?: {ok, failures} }`.

- [ ] **Step 1: Viết test fail `scripts/ci/uj-build.workflow.test.mjs`.** File này nạp script workflow với `agent`/`parallel` giả lập để kiểm logic điều khiển.

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SOURCE = readFileSync(new URL('../../.claude/workflows/uj-build.js', import.meta.url), 'utf8')
  .replace(/^export const meta\s*=/m, 'const meta =');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const ARGS = { worktree: '/wt', plan: 'docs/plans/p.md', branch: 'feat/p', tasks: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] };
const done = { status: 'done', baseSha: 'b', headSha: 'h', files: ['x.ts'], summary: 's' };
const finding = (over = {}) => ({ severity: 'high', confidence: 90, file: 'x.ts', line: 1, issue: 'bug', suggestedFix: 'fix', ...over });

async function runWorkflow(handlers, args = ARGS) {
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ type: opts.agentType, label: opts.label, prompt });
    const h = handlers[opts.agentType];
    return h ? h(prompt, opts, calls) : { findings: [] };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SOURCE);
  const result = await fn(agent, parallel, undefined, () => {}, () => {}, args, { total: null });
  return { result, calls, count: (t) => calls.filter((c) => c.type === t).length };
}

const green = { 'uj-implementer': () => done, 'uj-ci-runner': () => ({ ok: true, failures: [] }) };

test('happy path: every task implemented once, reviewed once, CI + branch review', async () => {
  const { result, count } = await runWorkflow(green);
  assert.equal(result.status, 'done');
  assert.equal(result.tasks.length, 2);
  assert.equal(count('uj-implementer'), 2);
  assert.equal(count('uj-code-reviewer'), 3); // 2 tasks + branch review
  assert.equal(count('uj-security-auditor'), 3);
  assert.equal(count('pr-review-toolkit:pr-test-analyzer'), 1);
  assert.equal(count('uj-ci-runner'), 1);
});

test('blocking finding is fixed, then only the reviewer that raised it re-reviews', async () => {
  let codeReviews = 0;
  const { result, calls } = await runWorkflow({
    ...green,
    'uj-code-reviewer': () => ({ findings: codeReviews++ === 0 ? [finding()] : [] }),
  }, { ...ARGS, tasks: [{ id: 1, title: 'A' }] });
  assert.equal(result.status, 'done');
  assert.equal(result.tasks[0].rounds, 1);
  assert.equal(result.tasks[0].fixed, 1);
  const task1 = calls.filter((c) => c.label?.endsWith(':t1'));
  assert.deepEqual(task1.map((c) => c.type), [
    'uj-implementer', 'uj-code-reviewer', 'uj-security-auditor', 'uj-implementer', 'uj-code-reviewer',
  ]);
});

test('findings that never go away stop the run as needs-human after maxRounds fixes', async () => {
  const { result, count } = await runWorkflow({
    ...green,
    'uj-security-auditor': () => ({ findings: [finding({ severity: 'critical' })] }),
  }, { ...ARGS, maxRounds: 3 });
  assert.equal(result.status, 'needs-human');
  assert.equal(result.stoppedAt, 1);
  assert.equal(count('uj-implementer'), 1 + 3);
  assert.equal(result.blocking.length, 1);
});

test('low severity or low confidence findings do not loop but are kept (deduped) as follow-ups', async () => {
  const { result, count } = await runWorkflow({
    ...green,
    'uj-code-reviewer': () => ({ findings: [finding({ severity: 'low' }), finding({ confidence: 60, issue: 'maybe' })] }),
  });
  assert.equal(result.status, 'done');
  assert.equal(count('uj-implementer'), 2);
  assert.equal(result.followUps.length, 2);
});

test('blocked implementer stops before any review', async () => {
  const { result, count } = await runWorkflow({ ...green, 'uj-implementer': () => ({ ...done, status: 'blocked', blockedReason: 'plan unclear' }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'plan unclear');
  assert.equal(count('uj-code-reviewer'), 0);
});

test('a reviewer that dies (null) is an error, not a clean review', async () => {
  const { result } = await runWorkflow({ ...green, 'uj-security-auditor': () => null });
  assert.equal(result.status, 'error');
});

test('CI red after 2 fix rounds → needs-human', async () => {
  const { result, count } = await runWorkflow({ ...green, 'uj-ci-runner': () => ({ ok: false, failures: [{ gate: 'build', cause: 'x', files: [] }] }) });
  assert.equal(result.status, 'needs-human');
  assert.equal(count('uj-ci-runner'), 3);
  assert.equal(result.ci.ok, false);
});

test('missing args fail fast', async () => {
  const { result } = await runWorkflow(green, { tasks: [] });
  assert.equal(result.status, 'error');
});
```

- [ ] **Step 2: Chạy để thấy fail.**

Run: `node --test scripts/ci/uj-build.workflow.test.mjs`
Expected: FAIL, `ENOENT … .claude/workflows/uj-build.js`.

- [ ] **Step 3: Viết `.claude/workflows/uj-build.js`.**

```js
export const meta = {
  name: 'uj-build',
  description: 'UniJob build loop: implement plan tasks (TDD), code+security review, bounded fix rounds, full CI, branch review',
  whenToUse: 'Run by /uj-build after a plan is approved and its worktree exists. Not for ad-hoc use.',
  phases: [
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'CI' },
    { title: 'Branch review' },
  ],
}

const A = args || {}
const WT = A.worktree
const PLAN = A.plan
const TASKS = Array.isArray(A.tasks) ? A.tasks : []
const MAX_ROUNDS = typeof A.maxRounds === 'number' ? A.maxRounds : 3
const MAX_CI_ROUNDS = 2
const MIN_CONFIDENCE = 80
const BLOCKING_SEVERITIES = ['critical', 'high', 'medium']

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          file: { type: 'string' },
          line: { type: 'number' },
          issue: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['severity', 'confidence', 'file', 'issue', 'suggestedFix'],
      },
    },
  },
  required: ['findings'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    baseSha: { type: 'string' },
    headSha: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    blockedReason: { type: 'string' },
  },
  required: ['status', 'baseSha', 'headSha', 'files', 'summary'],
}

const CI_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { gate: { type: 'string' }, cause: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
        required: ['gate', 'cause', 'files'],
      },
    },
  },
  required: ['ok', 'failures'],
}

const REVIEWERS = {
  code: { agentType: 'uj-code-reviewer', focus: 'correctness bugs, regressions in callers, mismatch with the plan task' },
  security: { agentType: 'uj-security-auditor', focus: 'Firebase rules, trusted fields written by the client, auth/validation, secrets, XSS' },
  tests: { agentType: 'pr-review-toolkit:pr-test-analyzer', focus: 'missing or weak tests for the behaviour this branch adds' },
  failures: { agentType: 'pr-review-toolkit:silent-failure-hunter', focus: 'swallowed errors and misleading fallbacks' },
}

const CONTEXT = `Worktree (work ONLY here, use absolute paths and git -C): ${WT}
Plan: ${PLAN} (read it inside the worktree)
Repo rules: CLAUDE.md. Never add a Co-Authored-By trailer.`

const key = (f) => `${f.file}:${f.line ?? '?'}:${f.issue}`
const isBlocking = (f) => BLOCKING_SEVERITIES.includes(f.severity) && f.confidence >= MIN_CONFIDENCE

const followUps = []
const seenFollowUps = new Set()
function keepFollowUps(findings) {
  for (const f of findings) {
    if (isBlocking(f) || seenFollowUps.has(key(f))) continue
    seenFollowUps.add(key(f))
    followUps.push(f)
  }
}

const results = []
const stop = (status, extra) => ({ status, tasks: results, followUps, ...extra })

function implement(task) {
  return agent(
    `${CONTEXT}\n\nImplement plan task ${task.id}: "${task.title}". Follow the task's steps exactly (TDD), run node scripts/ci-local.mjs --quick until green, then make a checkpoint commit whose message ends with [task:${task.id}].`,
    { label: `implement:t${task.id}`, phase: 'Implement', agentType: 'uj-implementer', schema: IMPL_SCHEMA },
  )
}

function fix(label, instructions) {
  return agent(
    `${CONTEXT}\n\n${instructions}\nFix only what is listed. Run node scripts/ci-local.mjs --quick until green, then make a checkpoint commit.`,
    { label, phase: 'Fix', agentType: 'uj-implementer', schema: IMPL_SCHEMA },
  )
}

function review(kind, range, what, label, phaseName) {
  const r = REVIEWERS[kind]
  return agent(
    `${CONTEXT}\n\nReview the diff \`git -C ${WT} diff ${range}\` (${what}). Focus: ${r.focus}. Return findings with severity and confidence (0-100). Empty list if nothing real.`,
    { label, phase: phaseName, agentType: r.agentType, schema: FINDINGS_SCHEMA },
  ).then((res) => (res ? { kind, findings: res.findings.map((f) => ({ ...f, reviewer: kind })) } : null))
}

async function reviewUntilClean(kinds, range, what, labelFor, phaseName, maxRounds, fixLabelFor) {
  let active = kinds
  let rounds = 0
  let fixed = 0
  for (;;) {
    const reviews = await parallel(active.map((k) => () => review(k, range(), what, labelFor(k), phaseName)))
    if (reviews.some((r) => !r)) return { error: `reviewer ${active[reviews.findIndex((r) => !r)]} returned nothing` }
    const all = reviews.flatMap((r) => r.findings)
    keepFollowUps(all)
    const blocking = all.filter(isBlocking)
    if (blocking.length === 0) return { rounds, fixed }
    if (rounds >= maxRounds) return { needsHuman: true, blocking, rounds, fixed }
    const res = await fix(fixLabelFor(rounds + 1), `Fix these review findings:\n${JSON.stringify(blocking, null, 2)}`)
    if (!res) return { error: 'implementer returned nothing during fix' }
    if (res.status === 'blocked') return { blocked: res.blockedReason || 'blocked during fix' }
    fixed += blocking.length
    rounds += 1
    active = [...new Set(blocking.map((f) => f.reviewer))]
  }
}

if (!WT || !PLAN || TASKS.length === 0) {
  return stop('error', { reason: 'uj-build needs args {worktree, plan, branch, tasks:[{id,title}]}' })
}

for (const task of TASKS) {
  phase('Implement')
  const impl = await implement(task)
  if (!impl) return stop('error', { stoppedAt: task.id, reason: 'implementer returned nothing' })
  if (impl.status === 'blocked') return stop('blocked', { stoppedAt: task.id, reason: impl.blockedReason || 'blocked' })

  const outcome = await reviewUntilClean(
    ['code', 'security'],
    () => `${impl.baseSha}..HEAD`,
    `plan task ${task.id}: ${task.title}`,
    (k) => `review-${k}:t${task.id}`,
    'Review',
    MAX_ROUNDS,
    (n) => `fix-r${n}:t${task.id}`,
  )
  if (outcome.error) return stop('error', { stoppedAt: task.id, reason: outcome.error })
  if (outcome.blocked) return stop('blocked', { stoppedAt: task.id, reason: outcome.blocked })
  if (outcome.needsHuman) return stop('needs-human', { stoppedAt: task.id, blocking: outcome.blocking })
  results.push({ id: task.id, title: task.title, rounds: outcome.rounds, fixed: outcome.fixed, status: 'done' })
  log(`task ${task.id} done (${outcome.rounds} fix round(s))`)
}

phase('CI')
const runCi = (n) => agent(
  `${CONTEXT}\n\nRun node scripts/ci-local.mjs --full in the worktree root and report.`,
  { label: `ci-full#${n}`, phase: 'CI', agentType: 'uj-ci-runner', schema: CI_SCHEMA },
)
let ci = await runCi(0)
for (let n = 1; ci && !ci.ok && n <= MAX_CI_ROUNDS; n++) {
  const res = await fix(`fix-ci#${n}`, `Full CI failed. Failures:\n${JSON.stringify(ci.failures, null, 2)}\nAlso read ci/last-run.json.`)
  if (!res || res.status === 'blocked') return stop('blocked', { reason: 'implementer could not fix CI', ci })
  ci = await runCi(n)
}
if (!ci) return stop('error', { reason: 'ci-runner returned nothing' })
if (!ci.ok) return stop('needs-human', { reason: 'full CI still red', ci })

phase('Branch review')
const branch = await reviewUntilClean(
  ['code', 'security', 'tests', 'failures'],
  () => 'main...HEAD',
  'the whole branch',
  (k) => `branch-${k}`,
  'Branch review',
  1,
  (n) => `fix-branch-r${n}`,
)
if (branch.error) return stop('error', { reason: branch.error, ci })
if (branch.blocked) return stop('blocked', { reason: branch.blocked, ci })
if (branch.needsHuman) return stop('needs-human', { reason: 'branch review still has blocking findings', blocking: branch.blocking, ci })

if (branch.rounds > 0) {
  ci = await runCi(99)
  if (!ci || !ci.ok) return stop('needs-human', { reason: 'full CI red after branch-review fixes', ci })
}

return stop('done', { ci })
```

- [ ] **Step 4: Chạy test workflow.**

Run: `node --test scripts/ci/uj-build.workflow.test.mjs`
Expected: `# pass 8`, `# fail 0`.

Nếu test "happy path" lệch số lượng gọi (ví dụ `pr-test-analyzer` không được gọi), sửa workflow, không sửa test. Test là đặc tả của spec mục 4.2.

- [ ] **Step 5: Commit.**

```bash
node scripts/ci-local.mjs --quick
git add .claude/workflows scripts/ci/uj-build.workflow.test.mjs
git commit -m "chore: add uj-build workflow with bounded review/fix loop"
```

---

### Task 8: Năm lệnh `/uj-*`

**Files:** Create `.claude/commands/uj-brainstorm.md`, `uj-plan.md`, `uj-build.md`, `uj-ship.md`, `uj-status.md`.

**Interfaces:**
- Consumes: agents (Task 6), workflow `uj-build` và định dạng trả về của nó (Task 7), `ci-local` (Task 4).
- Produces: các lệnh người dùng gõ trong Claude Code.

- [ ] **Step 1: `.claude/commands/uj-brainstorm.md`**

```markdown
---
description: Stage 1 — brainstorm an idea into a draft spec (stops at gate 1)
argument-hint: <idea or problem, in any language>
---

Run stage 1 of the UniJob pipeline for: $ARGUMENTS

1. Brainstorm in THIS session, because brainstorming needs back-and-forth with the human. Invoke the `superpowers:brainstorming` skill and follow it, acting with the mindset defined in `.claude/agents/uj-product-strategist.md` (read it first).
2. Write the spec to `docs/specs/YYYY-MM-DD-<topic>.md` with front matter `status: draft`.
3. Commit it on a `docs/<topic>` branch or the current feature branch: run `node scripts/ci-local.mjs --quick`, then `git commit -m "docs: add <topic> spec"`. No Co-Authored-By.
4. GATE 1: ask the human to review the spec. Only when they explicitly approve, change the front matter to `status: approved`, commit (`docs: approve <topic> spec`), and tell them the next step is `/uj-plan docs/specs/<file>`.
```

- [ ] **Step 2: `.claude/commands/uj-plan.md`**

```markdown
---
description: Stage 2 — turn an approved spec into a TDD plan (stops at gate 2)
argument-hint: <path to approved spec>
---

Spec: $ARGUMENTS

1. Read the spec. If its front matter is not `status: approved`, stop and tell the human that gate 1 is not passed.
2. Dispatch the `uj-architect-planner` agent with the spec path. It writes `docs/plans/YYYY-MM-DD-<topic>.md` (`status: draft`, `branch:` set, tasks as `### Task N: <title>`).
3. Check the plan yourself: every spec section maps to a task; no placeholders; task headings match the exact format. Fix small issues inline.
4. Run `node scripts/ci-local.mjs --quick`, then commit `docs: add <topic> plan`.
5. GATE 2: ask the human to review the plan. On explicit approval set `status: approved`, commit (`docs: approve <topic> plan`), and tell them the next step is `/uj-build docs/plans/<file>`.
```

- [ ] **Step 3: `.claude/commands/uj-build.md`**

```markdown
---
description: Stage 3 — run the uj-build workflow (implement → review/security → fix → full CI → branch review) in a worktree
argument-hint: <path to approved plan> [--resume]
---

Arguments: $ARGUMENTS

Preconditions (stop and explain if any fails):
1. The plan front matter has `status: approved`.
2. `git status --porcelain` is empty in the main checkout.
3. Read `branch:` from the plan front matter (for example `feat/escrow-functions`). The topic is the part after the slash.

Prepare the worktree:
4. If `.worktrees/<topic>` does not exist: `git worktree add .worktrees/<topic> -b <branch> main`, then run `npm ci` in `.worktrees/<topic>/unijob-web`. With `--resume`, reuse the existing worktree.
5. Parse the tasks from the plan: every line matching `^### Task (\d+): (.+)$` becomes `{id, title}`. With `--resume`, drop every task whose marker `[task:N]` already appears in `git -C .worktrees/<topic> log main..HEAD --format=%s`. If a Workflow run of uj-build from this same session was interrupted, pass `resumeFromRunId` instead.

Run:
6. Call the Workflow tool with `name: "uj-build"` and `args: {worktree: "<absolute path of .worktrees/<topic>>", plan: "<plan path>", branch: "<branch>", tasks: [...], maxRounds: 3}`.
7. When it finishes, write `.worktrees/<topic>/docs/runs/YYYY-MM-DD-<topic>.md` with: status, a table of tasks (id, title, rounds, findings fixed), the CI gate list, Follow-ups (every non-blocking finding with file:line, severity and confidence), and the blocking findings if the run stopped.
8. Commit the report in the worktree: `node scripts/ci-local.mjs --quick` (from the worktree), then `git -C .worktrees/<topic> commit -m "docs: add <topic> build report"`.
9. Tell the human the outcome:
   - `done` → next step `/uj-ship <topic>`.
   - `blocked` or `needs-human` → show the reason and blocking findings, and suggest editing the plan or giving guidance, then `/uj-build <plan> --resume`.
   - `error` → show the reason. Do not retry blindly.
```

- [ ] **Step 4: `.claude/commands/uj-ship.md`**

```markdown
---
description: Stage 4 — squash, full CI, then (after gate 3) push and open a PR assigned to the owner
argument-hint: <topic>
---

Topic: $ARGUMENTS (worktree `.worktrees/$ARGUMENTS`)

1. Dispatch `uj-release-manager` with the worktree path and the instruction "prepare only, do not push". It updates CHANGELOG, squashes the commits, runs `ci-local --full`, and drafts the PR title and body.
2. Show the human: the commit list (`git -C <wt> log --oneline main..HEAD`), `git -C <wt> diff --stat main...HEAD`, the gates from `ci/last-run.json`, the Follow-ups from the run report, and the PR title and body.
   If the branch touches payments, rules, Cloud Functions or auth, recommend running `/claude-security` before shipping.
3. GATE 3: ask "Push and open the PR?" Continue only on an explicit yes.
4. Push and open the PR yourself (the hooks verify CI):
   `git -C <wt> push -u origin <branch>`
   `gh pr create --base main --head <branch> --assignee @me --title "<title>" --body-file <tmpfile>`
   No Co-Authored-By. No "Generated with Claude Code" footer.
5. Report the PR URL. Remind the human that after merge, `/commit-commands:clean_gone` and `git worktree remove .worktrees/<topic>` clean up.
```

- [ ] **Step 5: `.claude/commands/uj-status.md`**

```markdown
---
description: Show where every UniJob pipeline item stands (specs, plans, worktrees, CI, PRs)
---

Report in a short table:
1. Specs in `docs/specs/` with their `status`.
2. Plans in `docs/plans/` with `status` and `branch`.
3. `git worktree list`. For each `.worktrees/*`: commits ahead of main, whether `ci/last-run.json` exists, its mode and ok, and whether it is still fresh (run `node -e` with `scripts/ci/git.mjs` `workingTreeFingerprint` and compare).
4. `gh pr list --author @me --state open`.
5. The next action for each item (for example "approve plan", "/uj-build …", "/uj-ship …").
```

- [ ] **Step 6: Commit.**

```bash
node scripts/ci-local.mjs --quick
git add .claude/commands
git commit -m "chore: add /uj-* pipeline commands"
```

---

### Task 9: CLAUDE.md, GitHub Actions, PR template, CHANGELOG

**Files:**
- Create: `CLAUDE.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/plans/.gitkeep`, `docs/runs/.gitkeep`

**Interfaces:**
- Consumes: mọi thứ ở trên.
- Produces: GitHub check `CI / ci` chạy trên mọi PR.

- [ ] **Step 1: `CLAUDE.md`**

```markdown
# UniJob

Campus task marketplace for HCMUT (React 19 + TypeScript + Vite 8 + Tailwind v4 + Zustand + TanStack Query + Firebase Auth/Firestore/Storage/Hosting). Target: a real product for the university, not a demo.

## Layout
- `unijob-web/` — the web app (all npm commands run here). `src/services/*` own Firestore access; pages stay thin; types live in `src/types`.
- `unijob-web/firestore.rules` — Firestore uses the named database `kirigitejkf8095h`. `unijob-web/tests/rules/` — rules tests (emulator, project `demo-unijob`).
- `scripts/ci-local.mjs` — local CI (same as GitHub Actions). `ci/` — budgets, the coverage legacy list, and `last-run.json` (gitignored).
- `.claude/` — agent team (`agents/uj-*`), pipeline commands (`commands/uj-*`), the `uj-build` workflow, and guard hooks.
- `docs/specs`, `docs/plans`, `docs/runs` — pipeline artifacts.

## Commands
- Dev: `cd unijob-web && npm run dev`
- Unit tests: `npm test` · Rules tests: `npm run test:rules` (needs Java ≥ 11)
- CI: `node scripts/ci-local.mjs --quick` (per task) · `--full` (before push; also in GitHub Actions)

## Pipeline (how every change is made)
`/uj-brainstorm <idea>` → spec ⛔ gate 1 → `/uj-plan <spec>` → plan ⛔ gate 2 → `/uj-build <plan>` (worktree, review/fix loop, full CI) → `/uj-ship <topic>` ⛔ gate 3 → PR. `/uj-status` shows where things stand.

## Rules
- NEVER add a `Co-Authored-By` trailer to commits, and NEVER add "Generated with Claude Code" or any AI footer to PRs. The guard-commit hook enforces the trailer rule.
- Every PR: `gh pr create --base main --assignee @me` (owner HieNguyen08).
- Conventional Commits. Branches `feat/…`, `fix/…`, `chore/…` from `main`.
- Commit only after `ci-local --quick` is green on the exact working tree; push only after `--full` is green on the exact HEAD tree (hook-enforced).
- Only `uj-implementer` changes code inside the pipeline; reviewers and auditors are read-only.
- Money, escrow, reputation/XP, completion status and notifications to other users must be written server-side (Cloud Functions/Admin SDK). Never trust these fields from the client.
- Never weaken tests, rules or CI thresholds to get green. `it.fails('KNOWN HOLE …')` tests in `tests/rules` list open security holes. Fixing one means turning it into a normal `it`.
- Never write `.env*` or service-account files (hook-enforced). Emulator project id is always `demo-unijob`.
- UI copy is Vietnamese.
```

- [ ] **Step 2: `CHANGELOG.md`**

```markdown
# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]

### Added
- Quy trình phát triển bằng đội agent: `/uj-brainstorm`, `/uj-plan`, `/uj-build`, `/uj-ship`, `/uj-status`.
- CI local `scripts/ci-local.mjs` và GitHub Actions: typecheck, lint, unit test + coverage, test Firestore rules trên emulator, build, bundle budget, npm audit, secret scan.
- Hook chặn commit/push khi CI chưa xanh, chặn trailer Co-Authored-By, chặn ghi file bí mật.

### Changed
- Nâng Vite lên 8.3 (bản stable), vá các lỗ hổng high/critical từ `npm audit`, dọn lỗi ESLint.
```

- [ ] **Step 3: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: unijob-web/package-lock.json
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - name: Install
        working-directory: unijob-web
        run: npm ci
      - name: ci-local --full
        run: node scripts/ci-local.mjs --full
      - name: Upload CI result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ci-last-run
          path: ci/last-run.json
```

- [ ] **Step 4: `.github/pull_request_template.md`**

```markdown
## Summary
<!-- What changes for users, in 2–5 bullets -->

## Spec & Plan
- Spec: docs/specs/…
- Plan: docs/plans/…
- Build report: docs/runs/…

## CI evidence
<!-- Gate list from ci/last-run.json (mode: full) -->

## Security notes
<!-- Rules/Functions/auth changes and how they are tested; or "none" -->

## Follow-ups
<!-- Non-blocking findings deferred, with file:line -->
```

- [ ] **Step 5: Tạo thư mục rỗng có theo dõi.**

```bash
mkdir -p docs/plans docs/runs && touch docs/plans/.gitkeep docs/runs/.gitkeep
```

- [ ] **Step 6: Commit.**

```bash
node scripts/ci-local.mjs --quick
git add CLAUDE.md CHANGELOG.md .github docs/plans/.gitkeep docs/runs/.gitkeep
git commit -m "docs: add CLAUDE.md, CI workflow, PR template and changelog"
```

---

### Task 10: Kiểm chứng toàn bộ và mở PR

**Files:** Không có file mới (chỉ có `ci/budget.json` nếu baseline đổi do Task 9, nhưng thường không đổi).

- [ ] **Step 1: Chạy full CI trên nhánh.**

Run: `node scripts/ci-local.mjs --full`
Expected: `ALL GREEN`, 10 gate PASS.

- [ ] **Step 2: Đọc lại spec, đối chiếu từng mục 2–8 với file đã tạo.** Ghi lại mọi điểm lệch vào phần "Deviations" của PR body:
  - tên agent có tiền tố `uj-`;
  - Storage emulator gate được hoãn đến khi B tạo `storage.rules`;
  - dry run đổi sang task `postedBy`;
  - 5 lỗi React Compiler được chặn có lý do, không sửa thật.

- [ ] **Step 3: Review toàn nhánh.** Dispatch `pr-review-toolkit:code-reviewer` trên `git diff main...HEAD`, và đặc biệt yêu cầu soi `scripts/`, `.claude/hooks/` và `.claude/workflows/`. Sửa các finding blocking theo đúng quy trình (test trước), chạy lại `--full`.

- [ ] **Step 4: GATE 3, hỏi người.** Đưa ra commit list, diff stat, các gate CI và PR body. Chỉ tiếp tục khi người đồng ý.

- [ ] **Step 5: Push và mở PR.**

```bash
git push -u origin chore/agent-pipeline
gh pr create --base main --head chore/agent-pipeline --assignee @me \
  --title "chore: agent pipeline, local CI and guard hooks" --body-file <tmpfile>
```
Expected: in ra URL PR. `gh pr view --json assignees` có `HieNguyen08`. `gh pr checks` cho thấy `CI / ci` chạy và xanh.

---

## Acceptance sau khi merge (dry run, chạy cùng người)

Spec mục 8.2 đề xuất task "chặn tạo `notifications` cho user khác". Tuy nhiên `job.service.ts:175`, `cancel.service.ts:61,107`, `cleanup.service.ts:50` và `CreateJob.tsx:148` đều tạo notification cho **người khác** từ client. Chặn ngay sẽ làm hỏng tính năng cho đến khi có Cloud Functions, vì vậy việc này thuộc sub-project B.

Dry run sẽ dùng task tương đương về độ nhỏ: **"rules: `jobs.create` bắt buộc `postedBy == request.auth.uid`"**. `CreateJob.tsx:112` đã gửi đúng `postedBy: userProfile.uid` nên không hỏng gì, và việc này lật được test `KNOWN HOLE` đầu tiên.

Các bước:
1. `/uj-brainstorm Siết rule tạo job: postedBy phải là người gọi` → duyệt spec (cửa 1).
2. `/uj-plan …` → duyệt plan (cửa 2).
3. `/uj-build …` → kỳ vọng `done`, có `docs/runs/…`.
4. `/uj-ship postedby-rule` → duyệt (cửa 3) → PR.

Đạt khi:
- (a) dừng đúng 3 cửa;
- (b) vòng review kết thúc trong giới hạn;
- (c) có báo cáo run;
- (d) `git log --format=%B` không có `Co-Authored-By`;
- (e) PR assign HieNguyen08;
- (f) GitHub Actions xanh.
