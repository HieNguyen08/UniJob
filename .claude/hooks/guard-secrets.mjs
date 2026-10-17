#!/usr/bin/env node
// PreToolUse(Write|Edit|MultiEdit|NotebookEdit) guard: agents never write secrets files or
// the CI evidence file ci/last-run.json (only scripts/ci-local.mjs writes it).
// Fails closed: any internal error exits 2 (the only exit code Claude Code treats as blocking).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isProtectedPath(p) {
  const parts = p.replace(/\\/g, '/').toLowerCase().split('/');
  const name = parts.at(-1) ?? '';
  if (name === 'last-run.json' && parts.at(-2) === 'ci') return true; // CI evidence: only ci-local writes it
  if (/^\.env(\..+)?$/.test(name) && !name.endsWith('.example')) return true;
  if (/service-?account.*\.json$/.test(name)) return true;
  if (/^serviceaccountkey.*\.json$/.test(name)) return true;
  if (/adminsdk.*\.json$/.test(name)) return true;
  if (/\.(pem|p12|pfx|key)$/.test(name)) return true;
  if (/^id_(rsa|ed25519|ecdsa)$/.test(name)) return true;
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (typeof target === 'string' && isProtectedPath(target)) {
      process.stderr.write(`[guard-secrets] Writing ${target} is blocked: secrets are managed by humans only (use the .example file), and ci/last-run.json is written only by node scripts/ci-local.mjs.\n`);
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`[guard-secrets] internal error: ${err?.message ?? err} — blocking to be safe\n`);
    process.exit(2);
  }
}
