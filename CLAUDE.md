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
