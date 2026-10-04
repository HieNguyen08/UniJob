import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { changedFiles, git, headTree, workingTreeFingerprint } from './git.mjs';

let repo;
before(() => {
  repo = mkdtempSync(join(tmpdir(), 'uj-git-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@example.com']);
  git(repo, ['config', 'user.name', 'T']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'init']);
});
after(() => rmSync(repo, { recursive: true, force: true }));

test('clean tree: fingerprint equals HEAD tree', () => {
  assert.equal(workingTreeFingerprint(repo), headTree(repo));
});

test('ignored files do not change the fingerprint', () => {
  const before = workingTreeFingerprint(repo);
  writeFileSync(join(repo, 'ignored.txt'), 'noise');
  assert.equal(workingTreeFingerprint(repo), before);
});

test('modified and untracked files change the fingerprint; committing them makes it equal HEAD tree again', () => {
  const clean = workingTreeFingerprint(repo);
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  writeFileSync(join(repo, 'new.txt'), 'new\n');
  const dirty = workingTreeFingerprint(repo);
  assert.notEqual(dirty, clean);
  assert.deepEqual(changedFiles(repo, 'HEAD').sort(), ['a.txt', 'new.txt']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'change']);
  assert.equal(headTree(repo), dirty);
});

test('fingerprint does not touch the real index', () => {
  writeFileSync(join(repo, 'b.txt'), 'b\n');
  workingTreeFingerprint(repo);
  assert.equal(git(repo, ['diff', '--cached', '--name-only']), '');
});
