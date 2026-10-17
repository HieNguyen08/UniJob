import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { evaluate, parseGitOps, splitSegments } from '../../../.claude/hooks/guard-commit.mjs';

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
  const script = fileURLToPath(new URL('../../../.claude/hooks/guard-commit.mjs', import.meta.url));
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
  const script = fileURLToPath(new URL('../../../.claude/hooks/guard-commit.mjs', import.meta.url));
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

test('commit/push chained with a file-changing command is blocked', () => {
  const cases = [
    `cd /r/.worktrees/x; sed -i '4{/^$/d}' f.ts; git add f.ts; git commit -q -m "x" 2>&1 | grep -v warning; git rev-parse HEAD`,
    'node scripts/ci-local.mjs --quick && git commit -m x',
    'echo x > a.ts && git commit -am x',
    'npm run fmt; git commit -m x',
    'git commit -m x; sed -i s/a/b/ f',
    'git add -A && git commit -m x | tee log.txt',
    'git commit -m x >> log.txt',
    'git commit -m x 2>err.log',
    'git diff --output=p.diff && git commit -m x',
    'git branch -D old && git commit -m x',
    'git commit -m x &>log.txt',
  ];
  for (const cmd of cases) {
    const r = run(cmd);
    assert.equal(r.block, true, cmd);
    assert.match(r.reason, /own tool call/, cmd);
  }
  for (const cmd of ["Set-Content a.ts 'x'; git commit -m x", 'git commit -m x | Out-File log.txt', "Add-Content a.ts 'x'; git commit -m x"]) {
    const r = ps(cmd);
    assert.equal(r.block, true, cmd);
    assert.match(r.reason, /own tool call/, cmd);
  }
  assert.match(run('npm run fmt; git commit -m x').reason, /also runs "npm"/);
  assert.equal(run('git push -u origin b; npm run fmt', { readLastRun: fullOk }).block, true);
});

test('commit/push with only read-only companions is allowed', () => {
  const cases = [
    'git -C /r/.worktrees/x add a b && git -C /r/.worktrees/x commit -m "x"',
    'cd /r/.worktrees/x && git add -A && git commit -m x && git status --short',
    'git commit -m x 2>&1 | tail -2',
    'git commit -m "a > b" 2>/dev/null',
    'git add -A && git commit -m x && git log --oneline -1 | head -1 && git branch --show-current',
    'pwd; git diff --stat; git commit -m x; echo done | wc -l',
  ];
  for (const cmd of cases) assert.equal(run(cmd).block, false, cmd);
  assert.equal(run('git push -u origin b', { readLastRun: fullOk }).block, false);
  assert.equal(ps('Set-Location /r; git add -A; git commit -m "x" 2>$null').block, false);
  // commands without commit or push are untouched by the rule
  assert.equal(run('sed -i s/a/b/ f && npm run fmt > out.txt', { readLastRun: () => null }).block, false);
});

test('splitSegments keeps fd duplication redirects inside the token', () => {
  assert.deepEqual(splitSegments('git commit -m x 2>&1 | tail -2'), [['git', 'commit', '-m', 'x', '2>&1'], ['tail', '-2']]);
  assert.deepEqual(splitSegments('git commit -m x 2>&1; git push', 'powershell'), [['git', 'commit', '-m', 'x', '2>&1'], ['git', 'push']]);
});

const blocksChain = (r, cmd) => {
  assert.equal(r.block, true, cmd);
  assert.match(r.reason, /own tool call|commit\/push/, cmd);
};

test('chained git with global options other than -C is file-changing', () => {
  for (const cmd of [
    'git -c core.fsmonitor=x status && git commit -m x',
    'git -c diff.external=x diff && git commit -m x',
    "git -c core.pager='touch y' log && git commit -m x",
    'git -c diff.x.textconv=t show && git commit -m x',
    'git -c filter.lfs.clean=t add a && git commit -m x',
    'git --config-env=core.pager=P log && git commit -m x',
    'git -cfoo=x status && git commit -m x',
    'git --work-tree=w status && git commit -m x',
    'git --exec-path=/x log && git commit -m x',
    'git --no-pager=x log && git commit -m x',
    'git diff --ext-diff && git commit -m x',
    'git log -p --textconv && git commit -m x',
    'git show --textconv HEAD && git commit -m x',
  ]) blocksChain(run(cmd), cmd);
  assert.equal(run('git -C /r/w status && git -C /r/w diff --stat && git -C /r/w commit -m x').block, false);
});

test('env prefixes on chained segments are file-changing', () => {
  for (const cmd of [
    'GIT_EXTERNAL_DIFF=x git diff && git commit -m x',
    'GIT_PAGER=x git log; git commit -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=x git status && git commit -m x',
    'env GIT_PAGER=x git log && git commit -m x',
    'X=1 echo hi && git commit -m x',
  ]) blocksChain(run(cmd), cmd);
});

test('command substitution next to commit/push fails closed', () => {
  for (const cmd of [
    'echo `touch y` && git commit -m x',
    'echo "$(touch x)" && git commit -m x',
    'git commit -m "$(rm -rf src)"',
    'git commit -m "`rm -rf src`"',
    'git commit -m "$(cat <<EOF\nmsg\nEOF\n)"', // unquoted delimiter expands
    "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\ntouch y\n)\"",
    "git commit -m \"$(cat <<'EOF' && touch y\nmsg\nEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)$(touch y)\"",
  ]) blocksChain(run(cmd), cmd);
  blocksChain(ps('echo "$(ni f)"; git commit -m x'), 'ps $(');
  // the documented message form stays allowed
  assert.equal(run("git commit -m \"$(cat <<'EOF'\nfix(hooks): a (b) \"q\" `t` $(x)\n\nbody\nEOF\n)\"").block, false);
  assert.equal(run("git add a && git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\" && git status").block, false);
  assert.equal(run("echo 'a `b` $(c)' && git commit -m x").block, false);
  // without commit/push nothing changes
  assert.equal(run('echo `date` "$(pwd)"', { readLastRun: () => null }).block, false);
});

test('chained git add allows only pathspecs and -A/-u/--all/--', () => {
  for (const cmd of ['git add --chmod=+x a && git commit -m x', 'git add --renormalize . && git commit -m x', 'git add -f a && git commit -m x', 'git add -p && git commit -m x']) {
    blocksChain(run(cmd), cmd);
  }
  for (const cmd of ['git add -A && git commit -m x', 'git add -u && git commit -m x', 'git add --all . && git commit -m x', 'git add -- a b && git commit -m x']) {
    assert.equal(run(cmd).block, false, cmd);
  }
});

test('null sinks are per shell', () => {
  assert.equal(run('git commit -m x 2>/dev/null').block, false);
  blocksChain(run('git commit -m x 2>$null'), 'bash $null');
  blocksChain(run('git commit -m x 2>nul'), 'bash nul');
  assert.equal(ps('git commit -m x 2>$null').block, false);
  assert.equal(ps('git commit -m x 2>NUL').block, false);
  blocksChain(ps('git commit -m x 2>/dev/null'), 'ps /dev/null');
});

test('the commit/push op itself may not carry code-running options', () => {
  for (const cmd of [
    'git -c core.hooksPath=h commit -m x',
    'git -ccore.hooksPath=h commit -m x',
    'git --config-env=core.pager=P commit -m x',
    'git --exec-path=/tmp commit -m x',
    'GIT_EXTERNAL_DIFF=x git commit -m x',
    'env GIT_DIR=/x git commit -m x',
  ]) blocksChain(run(cmd), cmd);
  for (const cmd of ['git push --receive-pack=x origin b', 'git push --exec=x origin b', 'git push --receive-pack x origin b']) {
    blocksChain(run(cmd, { readLastRun: fullOk }), cmd);
  }
  assert.equal(run('git -c user.name=A -c user.email=a@b commit -m x').block, false);
  assert.equal(run('LANG=C git commit -m x').block, false);
});

test('PowerShell read-only cmdlets may share the call', () => {
  assert.equal(ps('git commit -m x | Select-Object -Last 2; git status | Select-String main | Out-String; Get-Location').block, false);
  assert.equal(ps('git log -1 | select -First 1 | sls x | Measure-Object; Write-Output ok; Write-Host ok; git commit -m x | Out-Host').block, false);
});

const blocked = (r, cmd) => assert.equal(r.block, true, cmd);
const allowed = (r, cmd) => assert.equal(r.block, false, `${cmd}: ${r.reason}`);

test('guarded op: only -C, -c user.name/user.email and safe flag globals', () => {
  for (const cmd of [
    'git --git-dir=/x/.git commit -m x',
    'git --work-tree /x commit -m x',
    'git --namespace n commit -m x',
    'git --super-prefix x commit -m x',
    'git --attr-source=HEAD commit -m x',
    'git --no-pager=x commit -m x',
    'git --bare commit -m x',
    'git -p commit -m x',
  ]) blocked(run(cmd), cmd);
  for (const cmd of [
    'git --no-pager commit -m x',
    'git -P commit -m x',
    'git --no-optional-locks --no-replace-objects --literal-pathspecs commit -m x',
    'git -C /r -c user.name=A -c user.email=a@b commit -m x',
  ]) allowed(run(cmd), cmd);
});

test('guarded op: env prefixes only LANG, LC_*, TZ', () => {
  for (const cmd of ['EDITOR=vim git commit -m x', 'PATH=/tmp git commit -m x', 'HOME=/x git commit -m x', 'env PAGER=x git commit -m x']) blocked(run(cmd), cmd);
  allowed(run('LANG=C LC_ALL=C TZ=UTC git commit -m x'), 'LANG/LC/TZ');
});

test('guarded op: git push options are allowlisted', () => {
  for (const cmd of [
    'git push --exe=./prog origin b',
    'git push --receive=./prog origin b',
    'git push -o ci.skip origin b',
    'git push --push-option=x origin b',
    'git push --repo=x',
    'git push --mirror',
  ]) blocked(run(cmd, { readLastRun: fullOk }), cmd);
  for (const cmd of [
    'git push -u origin feat/x',
    'git push --set-upstream origin b',
    'git push --force-with-lease origin b',
    'git push --force-with-lease=b:abc origin b',
    'git push -f --tags --follow-tags --no-verify --dry-run -n -q --quiet -v --verbose --porcelain --atomic origin b',
    'git push --delete origin b',
    'git push -d origin b',
    'git push --force origin HEAD:refs/heads/b',
  ]) allowed(run(cmd, { readLastRun: fullOk }), cmd);
});

test('heredoc message form is parsed exactly', () => {
  blocked(run("git commit -m \"$(cat <<'EOF'\nmsg\nEOF \nmore\nEOF\n)$(touch x)\""), 'trailing-space delimiter then substitution');
  blocked(run("git commit -m \"$(cat <<'EOF'\nmsg\nEOF \ntouch y\n)\""), 'trailing-space line is not the delimiter');
  blocked(run("git commit -m \"$(cat <<'EOF'\nmsg\nEOF\ntouch y\nEOF\n)\""), 'later fake delimiter');
  blocked(run("git commit -m \"$(cat <<'EOF'\nmsg\nEOF\r\n)\""), 'CR on delimiter line');
  blocked(run("git commit -m \"$(cat <<'EOF'\nmsg\n\tEOF\n)\""), 'tab-indented delimiter without <<-');
  allowed(run("git commit -m \"$(cat <<-'EOF'\n\tmsg\n\tEOF\n)\""), '<<- strips tabs');
  allowed(run("git commit -m \"$(cat <<'EOF'\nfix: a\n\nbody\nEOF\n  \n)\""), 'normal form');
});

test('wrapper options before git commit/push fail closed', () => {
  for (const cmd of [
    'env -i GIT_DIR=x git commit -m x',
    'env -u A git commit -m x',
    'env -C /x git commit -m x',
    "env -S 'git commit -m x'",
    'sudo --user root git push',
    'nice -n 5 git commit -m x',
    'command -p git commit -m x',
    'time -p git commit -m x',
  ]) blocked(run(cmd, { readLastRun: fullOk }), cmd);
  allowed(run('nohup git commit -m x'), 'nohup without options');
  blocked(run("env -S 'sed -i s/a/b/ f'; git commit -m x"), 'env -S hides a chained command');
  blocked(run('sudo -u u ls; git commit -m x'), 'wrapper options on a chained segment');
  assert.deepEqual(parseGitOps('git --super-prefix x commit -m a', '/r', { platform: 'linux', homedir: '/h' }).map((o) => o.kind), ['commit']);
});

test('safe flag globals on chained read-only git segments are allowed', () => {
  allowed(run('git --no-pager log -1 && git push', { readLastRun: fullOk }), 'no-pager log');
  allowed(run('git -P diff --stat && git --no-optional-locks status && git commit -m x'), '-P diff');
});

test('PowerShell expressions, Out-Null, Get-Date; git add dry-run flags; bash comments', () => {
  allowed(ps('git add -A | Out-Null; Get-Date; git commit -m x; $LASTEXITCODE'), 'Out-Null/Get-Date/$LASTEXITCODE');
  allowed(ps('git commit -m x; if ($LASTEXITCODE -ne 0) { Write-Host fail }'), 'if ($LASTEXITCODE)');
  allowed(ps('git commit -m x; $?'), '$?');
  blocked(ps('$x = 1; git commit -m x'), '$x = 1');
  blocked(ps('$f.Delete(); git commit -m x'), 'method call');
  for (const cmd of ['git add -n a', 'git add -v a', 'git add --dry-run a', 'git add --verbose a', 'git add -Av', 'git add -nv a', 'git add -uAn']) {
    allowed(run(`${cmd} && git commit -m x`), cmd);
  }
  blocked(run('git add -Af && git commit -m x'), '-Af');
  allowed(run('git add -A && git commit -m x # see `notes`'), 'backtick in comment');
  allowed(run('git commit -m x # $(not run)'), '$( in comment');
  blocked(run('echo a#`touch y` && git commit -m x'), '# inside a word is not a comment');
});

test('bash comments start only where bash starts them', () => {
  blocked(run('x}#y; sed -i s/a/b/ f; git commit -m x'), '} is not a word boundary');
  blocked(run('{#y; sed -i s/a/b/ f; git commit -m x'), '{ is not a word boundary');
  blocked(run('x\r#y; sed -i s/a/b/ f; git commit -m x'), 'CR is not whitespace in bash');
  blocked(run("''#y; sed -i s/a/b/ f; git commit -m x"), 'quoted empty word then #');
  const ops = (cmd) => parseGitOps(cmd, '/r', { platform: 'linux', homedir: '/h' }).map((o) => o.kind);
  assert.deepEqual(ops('echo a #c; git commit -m x'), []); // bash: everything after # is a comment
  assert.deepEqual(ops('echo a;#c; git commit -m x'), []);
  assert.deepEqual(ops('#c; git commit -m x'), []);
  assert.deepEqual(ops('git status # note\ngit commit -m x'), ['commit']);
  blocked(run('git status # note\ngit commit -m x', { readLastRun: () => null }), 'commit after a comment line');
});
