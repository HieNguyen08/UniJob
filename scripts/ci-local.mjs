#!/usr/bin/env node
// UniJob local CI. Same script runs in GitHub Actions. See CLAUDE.md "CI".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { budgetCheck, coverageViolations, findSecrets, toRepoRelative } from './ci/checks.mjs';
import { changedFiles, mergeBase, repoRoot, workingTreeFingerprint } from './ci/git.mjs';

const mode = process.argv.includes('--full') ? 'full' : 'quick';
const updateBudget = process.argv.includes('--update-budget');
const root = repoRoot();
const web = join(root, 'unijob-web');
let fingerprint = workingTreeFingerprint(root);

const base = mode === 'full' ? mergeBase(root) : 'HEAD';
const changed = changedFiles(root, base).filter((f) => existsSync(join(root, f)));
const webChanged = changed.filter((f) => f.startsWith('unijob-web/')).map((f) => f.slice('unijob-web/'.length));
const webTs = webChanged.filter((f) => /\.(ts|tsx)$/.test(f));
const webSrc = webTs.filter((f) => f.startsWith('src/'));
const toolingChanged = changed.some((f) => f.startsWith('scripts/') || f.startsWith('.claude/'));
const quote = (f) => `"${f}"`;

function run(cmd, cwd = web) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', CI: '1' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, tail: out.trim().split('\n').slice(-40).join('\n') };
}

const gates = [];
function gate(name, fn) {
  const started = performance.now();
  let res;
  try {
    res = fn();
  } catch (err) {
    res = { ok: false, summary: String(err?.stack ?? err) };
  }
  const entry = { name, ok: res.ok, skipped: Boolean(res.skipped), summary: res.summary ?? '', files: res.files ?? [], ms: Math.round(performance.now() - started) };
  gates.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${name}${entry.skipped ? ' (skipped)' : ''}  ${entry.ms}ms`);
  if (!entry.ok) console.log(entry.summary.split('\n').map((l) => `      ${l}`).join('\n'));
}

console.log(`ci-local --${mode}  (${changed.length} changed files vs ${base.slice(0, 12)})`);

gate('typecheck', () => {
  const r = run('npx tsc -b');
  return { ok: r.ok, summary: r.tail };
});

gate('lint', () => {
  if (mode === 'quick' && webTs.length === 0) return { ok: true, skipped: true, summary: 'no changed TS files' };
  const r = run(mode === 'full' ? 'npx eslint .' : `npx eslint ${webTs.map(quote).join(' ')}`);
  return { ok: r.ok, summary: r.tail, files: webTs };
});

gate('unit-tests', () => {
  if (mode === 'quick') {
    if (webSrc.length === 0) return { ok: true, skipped: true, summary: 'no changed src files' };
    const r = run(`npx vitest related --run --project unit --passWithNoTests ${webSrc.map(quote).join(' ')}`);
    return { ok: r.ok, summary: r.tail, files: webSrc };
  }
  const r = run('npx vitest run --project unit --coverage');
  return { ok: r.ok, summary: r.tail };
});

gate('tooling-tests', () => {
  if (mode === 'quick' && !toolingChanged) return { ok: true, skipped: true, summary: 'no tooling changes' };
  const r = run('node --test "scripts/**/*.test.mjs" ".claude/**/*.test.mjs"', root);
  return { ok: r.ok, summary: r.tail };
});

if (mode === 'full') {
  gate('coverage', () => {
    const summaryPath = join(web, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) return { ok: false, summary: 'coverage/coverage-summary.json missing — did unit-tests fail?' };
    const raw = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const pct = {};
    for (const [abs, v] of Object.entries(raw)) if (abs !== 'total') pct[toRepoRelative(abs, root)] = v.lines.pct;
    const legacy = JSON.parse(readFileSync(join(root, 'ci', 'coverage-legacy.json'), 'utf8'));
    const bad = coverageViolations(changed, pct, legacy);
    return {
      ok: bad.length === 0,
      summary: bad.length ? bad.map((b) => `${b.file}: ${b.pct}% < 70%`).join('\n') : 'changed in-scope files meet 70% lines',
      files: bad.map((b) => b.file),
    };
  });

  gate('rules-tests', () => {
    const r = run('npx firebase emulators:exec --only firestore --project demo-unijob "npx vitest run --project rules"');
    return { ok: r.ok, summary: r.tail };
  });

  gate('build', () => {
    const r = run('npx vite build');
    return { ok: r.ok, summary: r.tail };
  });

  gate('bundle-budget', () => {
    const assets = join(web, 'dist', 'assets');
    const entries = existsSync(assets) ? readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f)) : [];
    if (entries.length === 0) return { ok: false, summary: 'no dist/assets/index-*.js — did build fail?' };
    const bytes = Math.max(...entries.map((f) => gzipSync(readFileSync(join(assets, f))).length));
    const budgetPath = join(root, 'ci', 'budget.json');
    if (updateBudget) writeFileSync(budgetPath, `${JSON.stringify({ entryGzipBytes: bytes }, null, 2)}\n`);
    const { entryGzipBytes } = JSON.parse(readFileSync(budgetPath, 'utf8'));
    const { ok, limit } = budgetCheck(bytes, entryGzipBytes);
    return { ok, summary: `entry gzip ${bytes} B (baseline ${entryGzipBytes} B, limit ${limit} B)` };
  });

  gate('npm-audit', () => {
    const r = run('npm audit --omit=dev --audit-level=high');
    return { ok: r.ok, summary: r.tail };
  });

  gate('secret-scan', () => {
    const scannable = changed.filter((f) => statSync(join(root, f)).size < 1_000_000);
    const hits = [];
    for (const f of scannable) {
      for (const name of findSecrets(readFileSync(join(root, f), 'utf8'))) hits.push(`${f}: ${name}`);
    }
    let gitleaks = 'gitleaks skipped (docker unavailable)';
    const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    if (docker.status === 0 && scannable.length > 0) {
      const scanDir = mkdtempSync(join(tmpdir(), 'uj-scan-'));
      try {
        for (const f of scannable) {
          mkdirSync(dirname(join(scanDir, f)), { recursive: true });
          copyFileSync(join(root, f), join(scanDir, f));
        }
        const r = run(`docker run --rm -v "${scanDir}:/scan" ghcr.io/gitleaks/gitleaks:v8.21.2 dir /scan --no-banner --redact`, root);
        gitleaks = r.ok ? 'gitleaks: clean' : `gitleaks findings:\n${r.tail}`;
        if (!r.ok) hits.push('gitleaks: findings (see summary)');
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
    return { ok: hits.length === 0, summary: [...hits, gitleaks].join('\n'), files: hits.map((h) => h.split(':')[0]) };
  });
}

if (updateBudget) fingerprint = workingTreeFingerprint(root); // budget.json itself changed
const ok = gates.every((g) => g.ok);
mkdirSync(join(root, 'ci'), { recursive: true });
writeFileSync(
  join(root, 'ci', 'last-run.json'),
  `${JSON.stringify({ mode, fingerprint, ok, finishedAt: new Date().toISOString(), gates }, null, 2)}\n`,
);
console.log(ok ? `\nci-local --${mode}: ALL GREEN` : `\nci-local --${mode}: FAILED — details in ci/last-run.json`);
process.exit(ok ? 0 : 1);
