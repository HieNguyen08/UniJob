#!/usr/bin/env node
// UniJob local CI. Same script runs in GitHub Actions. See CLAUDE.md "CI".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { budgetCheck, coverageViolations, entryChunkFromHtml, findSecrets, findSecretsInPatch, isShellSafePath, toRepoRelative } from './ci/checks.mjs';
import { changedFiles, git, mergeBase, repoRoot, workingTreeFingerprint } from './ci/git.mjs';

const mode = process.argv.includes('--full') ? 'full' : 'quick';
const updateBudget = process.argv.includes('--update-budget');
// The repo (or worktree) this script belongs to, not process.cwd(): `node <wt>/scripts/ci-local.mjs` checks <wt>.
const root = repoRoot(dirname(fileURLToPath(import.meta.url)));
const web = join(root, 'unijob-web');
let fingerprint = workingTreeFingerprint(root);

const base = mode === 'full' ? mergeBase(root) : 'HEAD';
const changed = changedFiles(root, base).filter((f) => existsSync(join(root, f)));
const webChanged = changed.filter((f) => f.startsWith('unijob-web/')).map((f) => f.slice('unijob-web/'.length));
const webTs = webChanged.filter((f) => /\.(ts|tsx)$/.test(f));
const webSrc = webTs.filter((f) => f.startsWith('src/'));
const toolingChanged = changed.some((f) => f.startsWith('scripts/') || f.startsWith('.claude/'));
const quote = (f) => `"${f}"`;
const unsafeFiles = (files) => files.filter((f) => !isShellSafePath(f));
const unsafeResult = (files) => ({ ok: false, summary: unsafeFiles(files).map((f) => `unsafe file name for shell: ${f}`).join('\n'), files: unsafeFiles(files) });

function run(cmd, cwd = web) {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
  });
  const spawnError = r.error ? `\nspawn error: ${r.error.message}` : '';
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}${spawnError}`;
  return { ok: r.status === 0 && !r.error, status: r.status, error: r.error, tail: out.trim().split('\n').slice(-40).join('\n') };
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
  if (mode === 'quick' && unsafeFiles(webTs).length) return unsafeResult(webTs);
  const r = run(mode === 'full' ? 'npx eslint .' : `npx eslint ${webTs.map(quote).join(' ')}`);
  return { ok: r.ok, summary: r.tail, files: webTs };
});

gate('unit-tests', () => {
  if (mode === 'quick') {
    if (webSrc.length === 0) return { ok: true, skipped: true, summary: 'no changed src files' };
    if (unsafeFiles(webSrc).length) return unsafeResult(webSrc);
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
    const htmlPath = join(web, 'dist', 'index.html');
    const entry = existsSync(htmlPath) ? entryChunkFromHtml(readFileSync(htmlPath, 'utf8')) : null;
    if (!entry || !existsSync(join(assets, entry))) return { ok: false, summary: 'entry chunk not found via dist/index.html module script — did build fail?' };
    const bytes = gzipSync(readFileSync(join(assets, entry))).length;
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
    const tooBig = changed.filter((f) => !scannable.includes(f));
    const hits = [];
    for (const f of scannable) {
      for (const name of findSecrets(readFileSync(join(root, f), 'utf8'))) hits.push(`${f}: ${name}`);
    }
    // History: a secret added in one commit and removed in a later one still lands in remote history.
    const patch = git(root, ['log', '-p', '--format=', `${base}..HEAD`]);
    for (const h of findSecretsInPatch(patch)) hits.push(`history: ${h.name}`);
    let gitleaks = 'gitleaks skipped (docker unavailable)';
    const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    const dockerUp = docker.status === 0;
    if (!dockerUp && process.env.GITHUB_ACTIONS === 'true') {
      hits.push('gitleaks required in CI (docker unavailable)');
      gitleaks = 'gitleaks required in CI but docker is unavailable';
    }
    if (dockerUp && scannable.length > 0) {
      const scanDir = mkdtempSync(join(tmpdir(), 'uj-scan-'));
      try {
        for (const f of scannable) {
          mkdirSync(dirname(join(scanDir, f)), { recursive: true });
          copyFileSync(join(root, f), join(scanDir, f));
        }
        const r = run(`docker run --rm -v "${scanDir}:/scan" ghcr.io/gitleaks/gitleaks:v8.21.2 dir /scan --no-banner --redact`, root);
        if (r.ok) {
          gitleaks = 'gitleaks: clean';
        } else if (r.error || [125, 126, 127].includes(r.status)) {
          gitleaks = `gitleaks could not run: ${r.error?.message ?? `exit ${r.status}`}\n${r.tail}`;
          hits.push('gitleaks: could not run');
        } else {
          gitleaks = `gitleaks findings:\n${r.tail}`;
          hits.push('gitleaks: findings');
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
    return { ok: hits.length === 0, summary: [...hits, gitleaks, ...(tooBig.length ? [`skipped (>=1 MB): ${tooBig.join(', ')}`] : [])].join('\n'), files: hits.map((h) => h.split(':')[0]) };
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
