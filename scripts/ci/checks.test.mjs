import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetCheck, coverageViolations, findSecrets, toRepoRelative } from './checks.mjs';

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
