import { relative, sep } from 'node:path';

export const COVERAGE_MIN = 70;
export const BUDGET_TOLERANCE = 0.1;

const COVERAGE_SCOPE = [
  /^unijob-web\/src\/services\/.+\.ts$/,
  /^unijob-web\/src\/lib\/.+\.ts$/,
  /^unijob-web\/functions\/src\/.+\.ts$/,
];

/** Changed in-scope source files (not legacy, not tests) whose line coverage is under the minimum. */
export function coverageViolations(changed, pctByFile, legacy) {
  return changed
    .filter((f) => COVERAGE_SCOPE.some((re) => re.test(f)))
    .filter((f) => !f.endsWith('.test.ts') && !legacy.includes(f))
    .map((f) => ({ file: f, pct: pctByFile[f] ?? 0 }))
    .filter((x) => x.pct < COVERAGE_MIN);
}

export function budgetCheck(currentBytes, baselineBytes) {
  const limit = Math.round(baselineBytes * (1 + BUDGET_TOLERANCE));
  return { ok: currentBytes <= limit, limit };
}

const SECRET_PATTERNS = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'gcp-service-account', re: /"type"\s*:\s*"service_account"/ },
  { name: 'stripe-live-key', re: /\b[sr]k_live_[0-9a-zA-Z]{20,}/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

export function findSecrets(text) {
  return SECRET_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/** File names are interpolated into shell commands; only allow letters, digits and _ . / @ space + - . */
export function isShellSafePath(p) {
  return /^[\p{L}\p{N}_./@ +-]+$/u.test(p);
}

export function toRepoRelative(absPath, root) {
  return relative(root, absPath).split(sep).join('/').replace(/\\/g, '/');
}

/** Secrets introduced by a unified diff: only added lines (not +++ headers) are scanned. */
export function findSecretsInPatch(patchText) {
  const hits = [];
  for (const line of patchText.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const name of findSecrets(line)) hits.push({ name, line });
  }
  return hits;
}

/** File name (no directory) of the entry module script in a built index.html, or null. */
export function entryChunkFromHtml(html) {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']?module["']?(?=[\s>/]|$)/i.test(tag)) continue;
    const m = tag.match(/\bsrc\s*=\s*["']?\/?assets\/([^"'\s>]+\.js)["']?/i);
    if (m) return m[1];
  }
  return null;
}
