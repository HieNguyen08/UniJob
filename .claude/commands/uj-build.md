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
