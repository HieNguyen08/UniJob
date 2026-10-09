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
