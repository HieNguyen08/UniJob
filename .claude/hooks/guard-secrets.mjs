#!/usr/bin/env node
// PreToolUse(Write|Edit|MultiEdit) guard: agents never write secrets files.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isProtectedPath(p) {
  const name = p.replace(/\\/g, '/').split('/').pop() ?? '';
  if (/^\.env(\..+)?$/.test(name) && !name.endsWith('.example')) return true;
  if (/service-account.*\.json$/i.test(name)) return true;
  if (/\.(pem|p12|key)$/i.test(name)) return true;
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target === 'string' && isProtectedPath(target)) {
    process.stderr.write(`[guard-secrets] Writing ${target} is blocked: secrets are managed by humans only. Use the .example file instead.\n`);
    process.exit(2);
  }
}
