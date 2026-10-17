import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yml = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('ci.yml installs functions dependencies with npm ci', () => {
  assert.match(yml, /working-directory: unijob-web\/functions\s*\r?\n\s*run: npm ci/);
});

test('ci.yml caches both lockfiles', () => {
  assert.match(yml, /unijob-web\/package-lock\.json/);
  assert.match(yml, /unijob-web\/functions\/package-lock\.json/);
});
