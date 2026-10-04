import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function git(cwd, args, env) {
  return execFileSync('git', args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

/**
 * Tree sha of the whole working tree (tracked + untracked, minus ignored), built in a
 * throwaway index so the real index is untouched. Committing exactly this state yields
 * a HEAD whose tree has the same sha — that is what lets the push guard compare them.
 */
export function workingTreeFingerprint(root) {
  const index = join(tmpdir(), `uj-fp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(root, ['read-tree', 'HEAD'], env);
    git(root, ['add', '-A'], env);
    return git(root, ['write-tree'], env);
  } finally {
    rmSync(index, { force: true });
  }
}

export function headTree(root) {
  return git(root, ['rev-parse', 'HEAD^{tree}']);
}

export function mergeBase(root) {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(root, ['merge-base', 'HEAD', ref]);
    } catch {
      // ref missing (fresh clone without origin, or no local main) — try the next one
    }
  }
  return git(root, ['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0];
}

export function changedFiles(root, since) {
  // -z: git would otherwise C-quote non-ASCII paths ("TM\304\220T_...")
  const tracked = git(root, ['diff', '--name-only', '-z', since]).split('\0');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}
