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
