import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, parseGitCommand } from './guard-commit.mjs';

const deps = (over = {}) => ({
  repoRoot: (dir) => dir,
  readLastRun: () => ({ mode: 'quick', ok: true, fingerprint: 'T1' }),
  workingTreeFingerprint: () => 'T1',
  headTree: () => 'T1',
  readFile: () => '',
  ...over,
});

test('parseGitCommand: ignores non-commit commands', () => {
  assert.equal(parseGitCommand('git status').kind, null);
  assert.equal(parseGitCommand('echo "git commit"').kind, 'commit'); // conservative: still checked
});

test('parseGitCommand: reads -C and leading cd', () => {
  assert.deepEqual(parseGitCommand('git -C .worktrees/x commit -m "a"').dir, '.worktrees/x');
  assert.deepEqual(parseGitCommand('cd "C:/r/.worktrees/x" && git commit -m a').dir, 'C:/r/.worktrees/x');
  assert.equal(parseGitCommand('git push -u origin feat/x').kind, 'push');
  assert.equal(parseGitCommand('git commit -F msg.txt').messageFile, 'msg.txt');
});

test('blocks Co-Authored-By in the command', () => {
  const r = evaluate({ command: 'git commit -m "feat: x\n\nCo-Authored-By: Bot <b@x>"', cwd: '/r' }, deps());
  assert.equal(r.block, true);
  assert.match(r.reason, /Co-Authored-By/);
});

test('blocks Co-Authored-By inside a -F message file', () => {
  const r = evaluate({ command: 'git commit -F msg.txt', cwd: '/r' }, deps({ readFile: () => 'x\n\nco-authored-by: a <b>' }));
  assert.equal(r.block, true);
});

test('blocks commit without a CI run', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ readLastRun: () => null }));
  assert.equal(r.block, true);
  assert.match(r.reason, /ci-local\.mjs --quick/);
});

test('blocks commit when last CI failed', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ readLastRun: () => ({ mode: 'full', ok: false, fingerprint: 'T1' }) }));
  assert.equal(r.block, true);
});

test('blocks commit when code changed after CI', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/r' }, deps({ workingTreeFingerprint: () => 'T2' }));
  assert.equal(r.block, true);
  assert.match(r.reason, /changed since/);
});

test('allows commit when fingerprint matches (even for a partial git add)', () => {
  assert.equal(evaluate({ command: 'git add a.ts && git commit -m "feat: a"', cwd: '/r' }, deps()).block, false);
});

test('uses the worktree from -C to find CI results', () => {
  let seen;
  evaluate({ command: 'git -C .worktrees/x commit -m a', cwd: '/r' }, deps({ readLastRun: (root) => { seen = root; return { mode: 'quick', ok: true, fingerprint: 'T1' }; } }));
  assert.match(seen.replace(/\\/g, '/'), /\/r\/\.worktrees\/x$/);
});

test('push requires a green --full run matching HEAD tree', () => {
  assert.equal(evaluate({ command: 'git push -u origin feat/x', cwd: '/r' }, deps()).block, true); // quick only
  const full = () => ({ mode: 'full', ok: true, fingerprint: 'T1' });
  assert.equal(evaluate({ command: 'git push', cwd: '/r' }, deps({ readLastRun: full })).block, false);
  assert.equal(evaluate({ command: 'git push', cwd: '/r' }, deps({ readLastRun: full, headTree: () => 'T9' })).block, true);
});

test('not a git repo → allow (nothing to guard)', () => {
  const r = evaluate({ command: 'git commit -m a', cwd: '/tmp' }, deps({ repoRoot: () => { throw new Error('not a repo'); } }));
  assert.equal(r.block, false);
});
