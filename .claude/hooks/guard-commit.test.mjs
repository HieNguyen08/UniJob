import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { evaluate, parseGitOps } from './guard-commit.mjs';

const deps = (over = {}) => ({
  repoRoot: (dir) => dir,
  readLastRun: () => ({ mode: 'quick', ok: true, fingerprint: 'T1' }),
  workingTreeFingerprint: () => 'T1',
  headTree: () => 'T1',
  readFile: () => '',
  exists: () => true,
  headMessage: () => '',
  ...over,
});

const quickOk = () => ({ mode: 'quick', ok: true, fingerprint: 'T1' });
const fullOk = () => ({ mode: 'full', ok: true, fingerprint: 'T1' });
const run = (command, over, cwd = '/r') => evaluate({ command, cwd }, deps(over));
const norm = (p) => p.replace(/\\/g, '/');

test('does not treat mentions of git as git ops', () => {
  const blocked = (command) => run(command, { readLastRun: () => null }).block;
  assert.equal(blocked('git status'), false);
  assert.equal(blocked('git commit-tree abc'), false);
  assert.equal(blocked('gh pr create --body "run git push after CI"'), false);
  assert.equal(blocked('grep -rn "git push" scripts/'), false);
  assert.equal(blocked('echo "git commit"'), false); // old behaviour (block) was a false positive
  assert.equal(blocked('git commit -m a'), true);
});

test('parseGitOps: -C, cd, global options, segments', () => {
  const dirs = (cmd) => parseGitOps(cmd, '/r', { platform: 'linux', homedir: '/home/u' }).map((o) => `${o.kind}@${o.dir}`);
  assert.deepEqual(dirs('git -C .worktrees/x commit -m "a"'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('cd "/r/.worktrees/x" && git commit -m a'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('git --no-pager push'), ['push@/r']);
  assert.deepEqual(dirs('git -c k=v commit -m x'), ['commit@/r']);
  assert.deepEqual(dirs('git commit -m x && git push'), ['commit@/r', 'push@/r']);
  assert.deepEqual(dirs('(cd w && git commit -m a)'), ['commit@/r/w']);
  assert.deepEqual(dirs('/usr/bin/git push'), ['push@/r']);
  assert.equal(parseGitOps('git commit -F msg.txt', '/r', { platform: 'linux', homedir: '/h' })[0].messageFiles[0], 'msg.txt');
});

test('blocks the trailer in the command', () => {
  const r = run('git commit -m "feat: x\n\nCo-Authored-By: Bot <b@x>"');
  assert.equal(r.block, true);
  assert.match(r.reason, /Co-Authored-By/);
});

test('blocks the trailer inside a -F message file', () => {
  assert.equal(run('git commit -F msg.txt', { readFile: () => 'x\n\nco-authored-by: a <b>' }).block, true);
});

test('blocks commit without a CI run', () => {
  const r = run('git commit -m a', { readLastRun: () => null });
  assert.equal(r.block, true);
  assert.match(r.reason, /ci-local\.mjs --quick/);
});

test('blocks commit when last CI failed', () => {
  assert.equal(run('git commit -m a', { readLastRun: () => ({ mode: 'full', ok: false, fingerprint: 'T1' }) }).block, true);
});

test('blocks commit when code changed after CI', () => {
  const r = run('git commit -m a', { workingTreeFingerprint: () => 'T2' });
  assert.equal(r.block, true);
  assert.match(r.reason, /changed since/);
});

test('allows commit when fingerprint matches (even for a partial git add)', () => {
  assert.equal(run('git add a.ts && git commit -m "feat: a"').block, false);
});

test('uses the worktree from -C to find CI results', () => {
  let seen;
  run('git -C .worktrees/x commit -m a', { readLastRun: (root) => { seen = root; return quickOk(); } });
  assert.match(norm(seen), /\/r\/\.worktrees\/x$/);
});

test('push requires a green --full run matching HEAD tree', () => {
  assert.equal(run('git push -u origin feat/x').block, true); // quick only
  assert.equal(run('git push', { readLastRun: fullOk }).block, false);
  assert.equal(run('git push', { readLastRun: fullOk, headTree: () => 'T9' }).block, true);
});

test('not a git repo allows (nothing to guard)', () => {
  const r = run('git commit -m a', { repoRoot: () => { throw new Error('not a repo'); } }, '/tmp');
  assert.equal(r.block, false);
});

test('commit and push in one command: push still needs a full run', () => {
  assert.equal(run('git add -A && git commit -m x && git push -u origin f').block, true);
  assert.equal(run('git add -A && git commit -m x && git push -u origin f', { readLastRun: fullOk }).block, false);
});

test('global options before the subcommand cannot bypass the guard', () => {
  assert.equal(run('git -c core.editor=true commit -m x -m "Co-Authored-By: a"').block, true);
  assert.equal(run('git --no-pager push').block, true);
  assert.equal(run('git.exe commit -m x', { workingTreeFingerprint: () => 'STALE' }).block, true);
  assert.equal(run('/usr/bin/git -C . commit -m x', { workingTreeFingerprint: () => 'STALE' }).block, true);
});

test('cd normalisation: Git Bash /c/ paths and ~', () => {
  let seen;
  run('cd /c/r/.worktrees/x && git commit -m a', { platform: 'win32', readLastRun: (r) => { seen = r; return quickOk(); } });
  assert.equal(norm(seen), 'C:/r/.worktrees/x');
  run('cd ~/r && git push', { platform: 'linux', homedir: '/home/u', readLastRun: (r) => { seen = r; return fullOk(); } });
  assert.equal(seen, '/home/u/r');
});

test('cd earlier in the chain applies to the later git op', () => {
  let seen;
  const over = { readLastRun: (r) => { seen = r; return quickOk(); } };
  run('git add . && cd .worktrees/x && git commit -m a', over);
  assert.match(norm(seen), /\/r\/\.worktrees\/x$/);
  seen = undefined;
  run('(cd .worktrees/x && git commit -m a)', over);
  assert.match(norm(seen), /\/r\/\.worktrees\/x$/);
});

test('message file variants are scanned for the trailer', () => {
  const readFile = () => 'x\n\nCo-Authored-By: a <b>';
  assert.equal(run('git commit --file=msg.txt', { readFile }).block, true);
  assert.equal(run('git commit -Fmsg.txt', { readFile }).block, true);
  assert.equal(run('git commit -aF msg.txt', { readFile }).block, true);
  assert.equal(run('git commit --template msg.txt', { readFile }).block, true);
});

test('amend that would keep a trailer from HEAD is blocked', () => {
  const headMessage = () => 'old\n\nCo-Authored-By: a <b>';
  assert.equal(run('git commit --amend --no-edit', { headMessage }).block, true);
  assert.equal(run('git commit --amend -m clean', { headMessage }).block, false);
});

test('explicit directory that does not exist is blocked', () => {
  assert.match(run('cd /nope && git commit -m a', { exists: () => false }).reason, /directory not found/);
  assert.equal(run('git -C /nope commit -m a', { exists: () => false }).block, true);
});

test('corrupt last-run.json: evaluate throws (wrapper then exits 2)', () => {
  assert.throws(() => run('git commit -m a', { readLastRun: () => { throw new Error('corrupt'); } }));
});

test('hook process fails closed on malformed stdin', () => {
  const script = fileURLToPath(new URL('./guard-commit.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { input: '{not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /internal error/);
});
