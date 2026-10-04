import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isProtectedPath } from './guard-secrets.mjs';

test('protects env files but not examples', () => {
  assert.equal(isProtectedPath('C:\\r\\unijob-web\\.env.local'), true);
  assert.equal(isProtectedPath('/r/.env'), true);
  assert.equal(isProtectedPath('/r/.env.production'), true);
  assert.equal(isProtectedPath('/r/unijob-web/.env.local.example'), false);
});

test('protects service accounts and key material', () => {
  assert.equal(isProtectedPath('/r/unijob-web/scripts/service-account.json'), true);
  assert.equal(isProtectedPath('/r/keys/server.pem'), true);
  assert.equal(isProtectedPath('/r/keys/app.p12'), true);
});

test('allows normal source files', () => {
  assert.equal(isProtectedPath('/r/unijob-web/src/lib/env.ts'), false);
  assert.equal(isProtectedPath('/r/docs/environment.md'), false);
});
