---
description: Stage 2 — turn an approved spec into a TDD plan (stops at gate 2)
argument-hint: <path to approved spec>
---

Spec: $ARGUMENTS

1. Read the spec. If its front matter is not `status: approved`, stop and tell the human that gate 1 is not passed.
2. Dispatch the `uj-architect-planner` agent with the spec path. It writes `docs/plans/YYYY-MM-DD-<topic>.md` (`status: draft`, `branch:` set, tasks as `### Task N: <title>`).
   The plan's `branch:` front matter must equal the branch that holds the spec. Commit the plan on that branch (`git switch <branch>` first if needed).
3. Check the plan yourself: every spec section maps to a task; no placeholders; task headings match the exact format. Fix small issues inline.
4. Run `node scripts/ci-local.mjs --quick`, then commit `docs: add <topic> plan`.
5. GATE 2: ask the human to review the plan. On explicit approval set `status: approved`, commit (`docs: approve <topic> plan`), and tell them the next step is `/uj-build docs/plans/<file>`.
