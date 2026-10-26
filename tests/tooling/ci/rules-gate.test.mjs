import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ci = readFileSync(new URL('../../../scripts/ci-local.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../../unijob-web/package.json', import.meta.url), 'utf8'));
const RULES_CMD = /firebase emulators:exec --only firestore,storage --project demo-unijob "(npx )?vitest run --project rules"/;

test('ci-local rules-tests starts the Firestore and Storage emulators', () => {
  assert.match(ci, RULES_CMD);
});
test('npm run test:rules starts the Firestore and Storage emulators', () => {
  assert.match(pkg.scripts['test:rules'], RULES_CMD);
});
test('functions tests keep their own emulators', () => {
  assert.match(pkg.scripts['test:functions'], /--only firestore,auth /);
});
