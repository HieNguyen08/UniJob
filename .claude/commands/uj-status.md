---
description: Show where every UniJob pipeline item stands (specs, plans, worktrees, CI, PRs)
---

Report in a short table:
1. Specs in `docs/specs/` with their `status`.
2. Plans in `docs/plans/` with `status` and `branch`.
3. `git worktree list`. For each `.worktrees/*`: commits ahead of main, whether `ci/last-run.json` exists, its mode and ok, and whether it is still fresh (`workingTreeFingerprint(root)` from `scripts/ci/git.mjs` takes the worktree's root path; run from the worktree root: `node -e "import('./scripts/ci/git.mjs').then(m=>console.log(m.workingTreeFingerprint(process.cwd())))"` and compare with the fingerprint in `ci/last-run.json`).
4. `gh pr list --author @me --state open`.
5. The next action for each item (for example "approve plan", "/uj-build …", "/uj-ship …").
