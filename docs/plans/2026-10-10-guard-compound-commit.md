---
title: guard-commit blocks commits chained after file-changing commands
status: approved
approved: 2026-10-10 by HieNguyen08 in chat (autonomous slices)
branch: fix/guard-compound-commit
---

# guard-commit: no file changes in the same call as a commit

## Problem
The PreToolUse hook runs before the command. A single Bash call such as
`sed -i '4d' f.ts; git add -A; git commit -m x` passes the hook, because the working tree still matches the `ci/last-run.json` fingerprint when the hook checks. The commit then contains code that CI never saw. This happened for real in commit 83d4b0e on `feat/functions-scaffold`.

## Rule
If a command contains a `commit` or `push` op, every other segment of that command must be on a read-only allowlist. Otherwise the hook blocks with:
`[guard-commit] Run git commit/push in its own tool call: this command also runs "<segment head>", which may change files after the CI check.`

Allowed segments:
- `cd`, `pushd`, `popd`, `Set-Location`, `sl`
- `git add`, `git status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git branch` (list form only)
- The commit or push op itself.
- Pure output commands with no redirect to a file: `echo`, `printf`, `pwd`, `true`, `ls`, `cat`, `head`, `tail`, `grep`, `wc`.
- A `|` pipe into `grep`, `head`, `tail`, `cat` or `wc` is allowed.

Any segment containing an output redirect (`>`, `>>`, `| tee`, `Out-File`, `Set-Content`, `Add-Content`) blocks. The exception is a stderr redirect such as `2>&1` or `2>/dev/null`.

## Task 1: implement the rule with tests
- Write the failing tests first in `tests/tooling/hooks/guard-commit.test.mjs`.
  - **Must block:**
    - the real incident command: `cd <wt>; sed -i '4{/^$/d}' f.ts; git add f.ts; git commit -q -m "x" 2>&1 | grep -v warning; git rev-parse HEAD`
    - `node scripts/ci-local.mjs --quick && git commit -m x` (CI and commit in the same call, as warned in CLAUDE.md)
    - `echo x > a.ts && git commit -am x`
    - `npm run fmt; git commit -m x`
    - PowerShell `Set-Content a.ts 'x'; git commit -m x`
    - `git commit -m x; sed -i s/a/b/ f` (an edit after a commit is harmless for that commit, but block it too for simplicity)
  - **Must allow:**
    - `git -C <wt> add a b && git -C <wt> commit -m "x"`
    - `cd <wt> && git add -A && git commit -m x && git status --short`
    - `git commit -m x 2>&1 | tail -2`
    - a plain `git push -u origin b` (CI rules unchanged)
    - every command without commit or push, unchanged
- Implement the rule in `.claude/hooks/guard-commit.mjs` using the existing segment parser.
- Update `CLAUDE.md` Rules with one line: commit/push must be its own tool call (only `git add`/`status` alongside).
- Update `.claude/agents/uj-implementer.md` with the same line.

Verify: `node --test "tests/tooling/**/*.test.mjs"` and `node scripts/ci-local.mjs --quick`. Commit `fix(hooks): block commit/push chained with file-changing commands [task:1]`.
