---
title: Consolidate test files into test folders
status: approved
approved: 2026-10-10 by HieNguyen08 in chat ("gom các file test về 1 folder cho gọn")
branch: chore/test-layout
---

# Consolidate test files

Goal: no test file lives next to source code. Web-app tests live under `unijob-web/tests/`; repo tooling tests live under `tests/tooling/`. Behaviour and test counts stay identical.

### Task 1: Move tests and update every reference

Moves (`git mv`, keep history):

| From | To |
|---|---|
| `unijob-web/src/lib/fees.test.ts` | `unijob-web/tests/unit/lib/fees.test.ts` |
| `scripts/ci/checks.test.mjs` | `tests/tooling/ci/checks.test.mjs` |
| `scripts/ci/git.test.mjs` | `tests/tooling/ci/git.test.mjs` |
| `scripts/ci/uj-build.workflow.test.mjs` | `tests/tooling/ci/uj-build.workflow.test.mjs` |
| `.claude/hooks/guard-commit.test.mjs` | `tests/tooling/hooks/guard-commit.test.mjs` |
| `.claude/hooks/guard-secrets.test.mjs` | `tests/tooling/hooks/guard-secrets.test.mjs` |

Update:
- Relative imports and `new URL('…', import.meta.url)` paths inside the moved files (including spawned hook paths and the workflow source path).
- `unijob-web/vitest.config.ts`: the `unit` project includes only `tests/unit/**/*.test.ts`.
- `scripts/ci-local.mjs`:
  - The tooling-tests gate runs `node --test "tests/tooling/**/*.test.mjs"`, and it counts as changed when files under `scripts/`, `.claude/` or `tests/tooling/` change.
  - The quick unit gate also runs when files under `unijob-web/tests/unit/` change. It passes changed test files to `vitest related`, or runs them directly.
- `scripts/ci/checks.mjs` coverage filter: still excludes test files (they are no longer under `src/`; keep the `.test.ts` guard).
- `CLAUDE.md` Layout section: one line describing `unijob-web/tests/{unit,rules}` and `tests/tooling/`.
- `.claude/agents/uj-architect-planner.md`: it mentions test locations. Point new unit tests at `unijob-web/tests/unit/`.
- Grep the whole repo (excluding node_modules) for the old paths and fix every hit. This includes docs, the `.claude/settings.json` allowlist, the ci.yml workflow and the PR template.

Verify:
- `node --test "tests/tooling/**/*.test.mjs"` passes with the same number of tests as before the move (count first).
- `npm test` in `unijob-web/` passes the same unit tests.
- `node scripts/ci-local.mjs --full` is ALL GREEN.

One commit: `chore: move tests into unijob-web/tests and tests/tooling [task:1]`.
