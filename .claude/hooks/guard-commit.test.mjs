import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { evaluate, parseGitOps, splitSegments } from './guard-commit.mjs';

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

const ps = (command, over, cwd = '/r') => evaluate({ command, cwd, shell: 'powershell' }, deps(over));

test('PowerShell: trailer inside a here-string is blocked', () => {
  for (const q of ["'", '"']) {
    const cmd = `git commit -m @${q}\nfeat: x\n\nCo-Authored-By: Bot <b@x>\n${q}@`;
    assert.equal(ps(cmd).block, true);
  }
});

test('PowerShell: here-string content is quoted text, not commands', () => {
  const ops = parseGitOps("git commit -m @'\nfeat: x; git push (y)\n'@", '/r', { platform: 'linux', homedir: '/h', shell: 'powershell' });
  assert.deepEqual(ops.map((o) => o.kind), ['commit']);
  for (const cmd of ["git commit -m @'\nit's done; git push\n'@", 'git commit -m @"\nsay "hi"; git push\n"@']) {
    const kinds = parseGitOps(cmd, '/r', { platform: 'linux', homedir: '/h', shell: 'powershell' }).map((o) => o.kind);
    assert.deepEqual(kinds, ['commit'], cmd);
  }
});

test('PowerShell: Set-Location / sl / pushd / cd change the directory', () => {
  const dirs = (cmd) => parseGitOps(cmd, '/r', { platform: 'linux', homedir: '/h', shell: 'powershell' }).map((o) => `${o.kind}@${o.dir}`);
  assert.deepEqual(dirs('Set-Location .worktrees/x; git commit -m "x"'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('set-location -Path .worktrees/x; git commit -m "x"'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('sl .worktrees/x; git commit -m "x"'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('pushd .worktrees/x; git commit -m "x"'), ['commit@/r/.worktrees/x']);
  assert.deepEqual(dirs('cd .worktrees/x; git commit -m "x"'), ['commit@/r/.worktrees/x']);
  let seen;
  ps('Set-Location .worktrees/x; git commit -m "x"', { readLastRun: (r) => { seen = r; return quickOk(); } });
  assert.match(norm(seen), /\/r\/\.worktrees\/x$/);
});

test('PowerShell: backslash paths are literal and backtick escapes', () => {
  const ops = parseGitOps(String.raw`git -C C:\r\wt commit -m "a${'`'}"b"`, String.raw`C:\r`, { platform: 'win32', homedir: String.raw`C:\h`, shell: 'powershell' });
  assert.equal(norm(ops[0].dir), 'C:/r/wt');
  assert.deepEqual(splitSegments('git commit -m "a`"b"; git push', 'powershell'), [['git', 'commit', '-m', 'a"b'], ['git', 'push']]);
});

test('PowerShell: git push with only a quick run is blocked; git status is allowed', () => {
  assert.equal(ps('git push -u origin feat/x').block, true);
  assert.equal(ps('git status', { readLastRun: () => null }).block, false);
});

test('Bash: pushd changes the directory too', () => {
  const dirs = (cmd) => parseGitOps(cmd, '/r', { platform: 'linux', homedir: '/h' }).map((o) => `${o.kind}@${o.dir}`);
  assert.deepEqual(dirs('pushd .worktrees/x && git commit -m x'), ['commit@/r/.worktrees/x']);
});

test('hook process: PowerShell tool input is evaluated (trailer blocked)', () => {
  const script = fileURLToPath(new URL('./guard-commit.mjs', import.meta.url));
  const input = JSON.stringify({ tool_name: 'PowerShell', cwd: process.cwd(), tool_input: { command: "git commit -m @'\nx\n\nCo-Authored-By: a <b>\n'@" } });
  const r = spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Co-Authored-By/);
});

test('git behind shell keywords and script blocks is still guarded', () => {
  // quick-only CI: every push must block
  assert.equal(ps('node scripts/ci-local.mjs --quick; if ($?) { git push }').block, true);
  assert.equal(ps('git add -A; if ($?) { git commit -m "x Co-Authored-By: a" }').block, true);
  assert.equal(ps('if ($?) { git status } else { git push }').block, true);
  assert.equal(ps('foreach ($b in $x) { git push origin $b }').block, true);
  assert.equal(run('if git diff --quiet; then git push; fi').block, true);
  assert.equal(run('if ! git push; then echo no; fi').block, true);
  assert.equal(run('! git push').block, true);
  assert.equal(run('{ git push; }').block, true);
  assert.equal(run('while true; do git push; done').block, true);
  assert.equal(run('{ git commit -m a; }', { readLastRun: () => null }).block, true);
});

test('git commit/push through a nested shell fails closed', () => {
  for (const cmd of ['bash -c "git push"', 'sh -lc "git commit -m a"', 'echo x | xargs git push', 'cmd /c git push']) {
    const r = run(cmd, { readLastRun: fullOk });
    assert.equal(r.block, true, cmd);
    assert.match(r.reason, /nested shell/, cmd);
  }
  for (const cmd of ['Invoke-Expression "git push"', 'iex "git commit -m a"', 'pwsh -Command "git push"', 'powershell.exe -c "git push"']) {
    const r = ps(cmd, { readLastRun: fullOk });
    assert.equal(r.block, true, cmd);
    assert.match(r.reason, /nested shell/, cmd);
  }
});

test('keywords and nested shells without commit/push are allowed', () => {
  const none = { readLastRun: () => null };
  assert.equal(ps('if ($?) { git status }', none).block, false);
  assert.equal(run('bash -c "echo hi"', none).block, false);
  assert.equal(run('{ git log; }', none).block, false);
  assert.equal(run('if git diff --quiet; then echo same; fi', none).block, false);
  assert.equal(run('echo x | xargs git log', none).block, false);
});
