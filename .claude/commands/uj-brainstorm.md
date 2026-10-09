---
description: Stage 1 — brainstorm an idea into a draft spec (stops at gate 1)
argument-hint: <idea or problem, in any language>
---

Run stage 1 of the UniJob pipeline for: $ARGUMENTS

1. Brainstorm in THIS session, because brainstorming needs back-and-forth with the human. Invoke the `superpowers:brainstorming` skill and follow it, acting with the mindset defined in `.claude/agents/uj-product-strategist.md` (read it first).
2. Choose a topic slug and a branch `<feat|fix|chore>/<topic>`. BEFORE writing the spec, from a clean main checkout run `git switch -c <branch> main` (or `git switch <branch>` if it already exists).
3. On that branch, write the spec to `docs/specs/YYYY-MM-DD-<topic>.md` with front matter `status: draft`, run `node scripts/ci-local.mjs --quick`, then (in a separate call) `git commit -m "docs: add <topic> spec"`. No Co-Authored-By.
4. GATE 1: ask the human to review the spec. Only when they explicitly approve, change the front matter to `status: approved`, re-run `node scripts/ci-local.mjs --quick` (the tree changed), then commit (`docs: approve <topic> spec`), and tell them the next step is `/uj-plan docs/specs/<file>`.
