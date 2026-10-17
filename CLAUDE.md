# UniJob

Campus task marketplace for HCMUT (React 19 + TypeScript + Vite 8 + Tailwind v4 + Zustand + TanStack Query + Firebase Auth/Firestore/Storage/Hosting). Target: a real product for the university, not a demo.

## Layout
- `unijob-web/` — the web app (all npm commands run here). `src/services/*` own Firestore access; pages stay thin; types live in `src/types`.
- `unijob-web/firestore.rules` — Firestore uses the named database `kirigitejkf8095h`. Tests: `unijob-web/tests/unit/` (vitest unit), `unijob-web/tests/rules/` (rules, emulator, project `demo-unijob`), `tests/tooling/` (node:test for `scripts/` and `.claude/` hooks).
- `scripts/ci-local.mjs` — local CI (same as GitHub Actions). `ci/` — budgets, the coverage legacy list, and `last-run.json` (gitignored).
- `.claude/` — agent team (`agents/uj-*`), pipeline commands (`commands/uj-*`), the `uj-build` workflow, and guard hooks.
- `docs/specs`, `docs/plans`, `docs/runs` — pipeline artifacts.

## Prerequisites
- Node 24; Java ≥ 11 (Firestore rules tests on the emulator); `gh` logged in.
- Docker is optional locally: the secret scan uses gitleaks in Docker and falls back to a regex scan without it.
- Claude Code plugins: `superpowers`, `pr-review-toolkit`, `feature-dev`, `commit-commands` (all from `claude-plugins-official`).

## Commands
- Dev: `cd unijob-web && npm run dev`
- Unit tests: `npm test` · Rules tests: `npm run test:rules` (needs Java ≥ 11)
- CI: `node scripts/ci-local.mjs --quick` (per task) · `--full` (before push; also in GitHub Actions)

## Pipeline (how every change is made)
`/uj-brainstorm <idea>` → spec ⛔ gate 1 → `/uj-plan <spec>` → plan ⛔ gate 2 → `/uj-build <plan>` (worktree, review/fix loop, full CI) → `/uj-ship <topic>` ⛔ gate 3 → PR. `/uj-status` shows where things stand.
Spec, plan and code for a topic live on one branch `<type>/<topic>` cut from main.

## Rules
- NEVER add a `Co-Authored-By` trailer to commits, and NEVER add "Generated with Claude Code" or any AI footer to PRs. The guard-commit hook enforces the trailer rule.
- Every PR: `gh pr create --base main --assignee @me` (owner HieNguyen08).
- Conventional Commits. Branches `feat/…`, `fix/…`, `chore/…` from `main`.
- Commit only after `ci-local --quick` is green on the exact working tree; push only after `--full` is green on the exact HEAD tree (hook-enforced). The hooks do not stop a push to `main` (e.g. `git push origin HEAD:main`); that relies on GitHub branch protection.
- `git commit` / `git push` must be its own tool call: only `cd`, `git add`/`status`/`diff`/`log` and plain output commands may share it (hook-enforced; anything else could change files after the CI check).
- `unijob-web/package.json` overrides `@grpc/grpc-js` to `^1.14.5` because firebase pins `~1.9`, which has a high advisory. Remove the override once firebase ships a fixed range.
- Only `uj-implementer` changes code inside the pipeline; reviewers and auditors are read-only.
- Money, escrow, reputation/XP, completion status and notifications to other users must be written server-side (Cloud Functions/Admin SDK). Never trust these fields from the client.
- Never weaken tests, rules or CI thresholds to get green. `it.fails('KNOWN HOLE …')` tests in `tests/rules` list open security holes. Fixing one means turning it into a normal `it`.
- Never write `.env*` or service-account files (hook-enforced). Emulator project id is always `demo-unijob`.
- UI copy is Vietnamese.
