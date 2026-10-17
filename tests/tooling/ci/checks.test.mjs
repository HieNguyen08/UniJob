import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetCheck, coveragePctByFile, coverageViolations, entryChunkFromHtml, findSecrets, functionsAffected, findSecretsInPatch, isShellSafePath, toRepoRelative } from '../../../scripts/ci/checks.mjs';

test('coverage: new in-scope file below 70% is a violation', () => {
  const v = coverageViolations(['unijob-web/src/services/new.service.ts'], { 'unijob-web/src/services/new.service.ts': 40 }, []);
  assert.deepEqual(v, [{ file: 'unijob-web/src/services/new.service.ts', pct: 40 }]);
});

test('coverage: file missing from the report counts as 0%', () => {
  const v = coverageViolations(['unijob-web/src/lib/x.ts'], {}, []);
  assert.deepEqual(v, [{ file: 'unijob-web/src/lib/x.ts', pct: 0 }]);
});

test('coverage: legacy files, test files, out-of-scope files and passing files are ignored', () => {
  const changed = [
    'unijob-web/src/services/job.service.ts',
    'unijob-web/src/lib/fees.test.ts',
    'unijob-web/src/pages/Home.tsx',
    'unijob-web/src/lib/fees.ts',
  ];
  const v = coverageViolations(changed, { 'unijob-web/src/lib/fees.ts': 100 }, ['unijob-web/src/services/job.service.ts']);
  assert.deepEqual(v, []);
});

test('coverage: functions source is in scope', () => {
  const v = coverageViolations(['unijob-web/functions/src/escrow.ts'], { 'unijob-web/functions/src/escrow.ts': 69.9 }, []);
  assert.equal(v.length, 1);
});

test('budget: allows up to +10%, rejects above', () => {
  assert.deepEqual(budgetCheck(110, 100), { ok: true, limit: 110 });
  assert.deepEqual(budgetCheck(111, 100), { ok: false, limit: 110 });
});

test('secrets: detects private keys and service accounts, ignores normal code', () => {
  const pk = '-----BEGIN ' + 'PRIVATE KEY-----\nabc';
  const sa = '{ "type": "service' + '_account" }';
  const gh = 'ghp' + '_' + 'a'.repeat(36);
  assert.deepEqual(findSecrets(pk), ['private-key']);
  assert.deepEqual(findSecrets(sa), ['gcp-service-account']);
  assert.deepEqual(findSecrets(gh), ['github-token']);
  assert.deepEqual(findSecrets('const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;'), []);
});

test('toRepoRelative normalises separators', () => {
  assert.equal(toRepoRelative('C:\\r\\unijob-web\\src\\a.ts'.replace(/\\/g, '/'), 'C:/r'), 'unijob-web/src/a.ts');
});

test('patch scan: added private-key line is a hit with its line', () => {
  const key = '-----BEGIN ' + 'PRIVATE KEY-----';
  const patch = ['diff --git a/k b/k', '--- /dev/null', '+++ b/k', '@@ -0,0 +1 @@', `+${key}`].join('\n');
  assert.deepEqual(findSecretsInPatch(patch), [{ name: 'private-key', line: `+${key}` }]);
});

test('patch scan: removed secret is not a hit', () => {
  const key = '-----BEGIN ' + 'PRIVATE KEY-----';
  const patch = ['--- a/k', '+++ /dev/null', '@@ -1 +0,0 @@', `-${key}`].join('\n');
  assert.deepEqual(findSecretsInPatch(patch), []);
});

test('patch scan: +++ header lines are ignored', () => {
  const sa = '"type": "service' + '_account"';
  assert.deepEqual(findSecretsInPatch(`+++ b/${sa}`), []);
});

test('entryChunkFromHtml: finds the module script src', () => {
  const html = '<script type="module" crossorigin src="/assets/index-5e2VBsR0.js"></script><link rel="modulepreload" href="/assets/vendor-1.js">';
  assert.equal(entryChunkFromHtml(html), 'index-5e2VBsR0.js');
  assert.equal(entryChunkFromHtml('<html></html>'), null);
});

test('isShellSafePath: accepts ordinary names incl. spaces and Vietnamese', () => {
  assert.equal(isShellSafePath('src/a b.ts'), true);
  assert.equal(isShellSafePath('src/vi\u1ec7c l\u00e0m.ts'), true);
  assert.equal(isShellSafePath('src/@scope/x+y_z-1.tsx'), true);
});

test('isShellSafePath: rejects shell metacharacters', () => {
  assert.equal(isShellSafePath('src/$(rm -rf).ts'), false);
  assert.equal(isShellSafePath('src/`x`.ts'), false);
  assert.equal(isShellSafePath('src/a";b.ts'), false);
  assert.equal(isShellSafePath('src/%PATH%.ts'), false);
});

test('entryChunkFromHtml: matches script tags case-insensitively', () => {
  assert.equal(entryChunkFromHtml('<SCRIPT TYPE="module" SRC="/assets/index-AbC.js"></SCRIPT>'), 'index-AbC.js');
  assert.equal(entryChunkFromHtml('<Script Type="Module" crossorigin Src="/assets/index-X1.js">'), 'index-X1.js');
  assert.equal(entryChunkFromHtml('<SCRIPT SRC="/assets/legacy.js"></SCRIPT>'), null);
});

test('functionsAffected: functions files, mirrored web files and firebase.json trigger the functions gates', () => {
  assert.equal(functionsAffected(['unijob-web/functions/src/admin.ts']), true);
  assert.equal(functionsAffected(['unijob-web/functions/package.json']), true);
  assert.equal(functionsAffected(['unijob-web/src/lib/fees.ts']), true);
  assert.equal(functionsAffected(['unijob-web/src/types/notification.ts']), true);
  assert.equal(functionsAffected(['unijob-web/firebase.json']), true);
});

test('functionsAffected: web package.json (test:functions script) and firestore.rules (emulator tests) trigger the functions gates', () => {
  assert.equal(functionsAffected(['unijob-web/package.json']), true);
  assert.equal(functionsAffected(['unijob-web/firestore.rules']), true);
  assert.equal(functionsAffected(['unijob-web/package-lock.json', 'unijob-web/firestore.indexes.json', 'unijob-web/tests/rules/x.test.ts']), false);
});

test('functionsAffected: other web and repo files do not', () => {
  assert.equal(functionsAffected(['unijob-web/src/lib/utils.ts', 'unijob-web/src/pages/Home.tsx', 'scripts/ci-local.mjs', 'docs/x.md']), false);
  assert.equal(functionsAffected([]), false);
});

test('coveragePctByFile: merges web and functions summaries, skips total, repo-relative keys', () => {
  const web = { total: { lines: { pct: 50 } }, '/r/unijob-web/src/lib/fees.ts': { lines: { pct: 100 } } };
  const fn = { total: { lines: { pct: 90 } }, '/r/unijob-web/functions/src/admin.ts': { lines: { pct: 80 } } };
  assert.deepEqual(coveragePctByFile([web, fn], '/r'), {
    'unijob-web/src/lib/fees.ts': 100,
    'unijob-web/functions/src/admin.ts': 80,
  });
});
