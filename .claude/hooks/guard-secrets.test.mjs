import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isProtectedPath } from './guard-secrets.mjs';

test('protects env files but not examples', () => {
  assert.equal(isProtectedPath('C:\\r\\unijob-web\\.env.local'), true);
  assert.equal(isProtectedPath('/r/.env'), true);
  assert.equal(isProtectedPath('/r/.env.production'), true);
  assert.equal(isProtectedPath('/r/unijob-web/.env.local.example'), false);
});

test('matching is case-insensitive', () => {
  assert.equal(isProtectedPath('/r/.ENV'), true);
  assert.equal(isProtectedPath('/r/.Env.Local'), true);
  assert.equal(isProtectedPath('/r/.env.local.EXAMPLE'), false);
});

test('protects service accounts and key material', () => {
  assert.equal(isProtectedPath('/r/unijob-web/scripts/service-account.json'), true);
  assert.equal(isProtectedPath('/r/keys/server.pem'), true);
  assert.equal(isProtectedPath('/r/keys/app.p12'), true);
  assert.equal(isProtectedPath('/r/serviceAccountKey.json'), true);
  assert.equal(isProtectedPath('/r/unijob-ad6eb-firebase-adminsdk-x.json'), true);
  assert.equal(isProtectedPath('/r/cert.pfx'), true);
  assert.equal(isProtectedPath('/home/u/.ssh/id_rsa'), true);
  assert.equal(isProtectedPath('/home/u/.ssh/id_ed25519'), true);
  assert.equal(isProtectedPath('/home/u/.ssh/id_ecdsa'), true);
});

test('allows normal source files', () => {
  assert.equal(isProtectedPath('/r/unijob-web/src/lib/env.ts'), false);
  assert.equal(isProtectedPath('/r/docs/environment.md'), false);
});

test('hook process fails closed on malformed stdin', () => {
  const script = fileURLToPath(new URL('./guard-secrets.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { input: '{not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /internal error/);
});
