#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) guard: no Co-Authored-By; commit only after a green ci-local run
// on the exact working tree; push only after a green --full run on the exact HEAD tree.
// Fails closed: any internal error exits 2 (the only exit code Claude Code treats as blocking).
import { existsSync, readFileSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, headTree, repoRoot, workingTreeFingerprint } from '../../scripts/ci/git.mjs';

const SEPARATORS = new Set(['&', '|', ';', '\n', '(', ')']);
const SHELL_SPECIAL = new Set([' ', '\t', '"', "'", '$', '`', '\\', ';', '&', '|', '(', ')', '<', '>', '\n', '#', '*', '?']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'sudo', 'time', 'nohup', 'builtin']);
const VALUE_OPTIONS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path']);

/**
 * Quote-aware split of a command line into segments of tokens (quotes stripped).
 * `shell` is 'bash' (default) or 'powershell' (backtick escapes, literal backslashes,
 * '' / "" doubled quotes, @'…'@ / @"…"@ here-strings).
 */
export function splitSegments(command, shell = 'bash') {
  if (shell === 'powershell') return splitPowerShell(command);
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const pushToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const endSegment = () => {
    pushToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
      continue;
    }
    if (quote === '"') {
      const next = command[i + 1];
      if (c === '\\' && next !== undefined && '"\\$`'.includes(next)) {
        cur += next;
        i++;
      } else if (c === '"') quote = null;
      else cur += c;
      continue;
    }
    if (c === '\\') {
      const next = command[i + 1];
      if (next === '\n') i++;
      else if (next !== undefined && SHELL_SPECIAL.has(next)) {
        cur += next;
        has = true;
        i++;
      } else {
        cur += c; // e.g. a Windows path C:\repo
        has = true;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === ' ' || c === '\t' || c === '\r') pushToken();
    else if (SEPARATORS.has(c)) endSegment();
    else {
      cur += c;
      has = true;
    }
  }
  endSegment();
  return segments;
}

function splitPowerShell(command) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false;
  const pushToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const endSegment = () => {
    pushToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (c === '@' && (next === "'" || next === '"') && /^[ \t]*\r?\n/.test(command.slice(i + 2))) {
      // here-string: everything up to a line that starts with the closing quote + @ is literal
      const close = new RegExp(`\\r?\\n${next}@`, 'g');
      const bodyStart = command.indexOf('\n', i + 2) + 1;
      close.lastIndex = bodyStart - 1;
      const m = close.exec(command);
      const end = m ? m.index : command.length;
      cur += command.slice(bodyStart, end);
      has = true;
      i = m ? m.index + m[0].length - 1 : command.length;
      continue;
    }
    if (c === "'") {
      has = true;
      for (i++; i < command.length; i++) {
        if (command[i] === "'") {
          if (command[i + 1] === "'") {
            cur += "'";
            i++;
          } else break;
        } else cur += command[i];
      }
      continue;
    }
    if (c === '"') {
      has = true;
      for (i++; i < command.length; i++) {
        const d = command[i];
        if (d === '`' && i + 1 < command.length) cur += command[++i];
        else if (d === '"') {
          if (command[i + 1] === '"') {
            cur += '"';
            i++;
          } else break;
        } else cur += d;
      }
      continue;
    }
    if (c === '`') {
      if (next === '\n') i++; // line continuation
      else if (next === '\r' && command[i + 2] === '\n') i += 2;
      else if (next !== undefined) {
        cur += next;
        has = true;
        i++;
      }
    } else if (c === ' ' || c === '\t' || c === '\r') pushToken();
    else if (SEPARATORS.has(c)) endSegment();
    else {
      cur += c;
      has = true;
    }
  }
  endSegment();
  return segments;
}

const DIR_CHANGERS = {
  bash: new Set(['cd', 'pushd']),
  powershell: new Set(['cd', 'chdir', 'sl', 'set-location', 'pushd', 'push-location']),
};

/** Target directory of a cd-like command, or undefined (no argument, `-`, unknown form). */
function dirChangeTarget(args, shell) {
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (shell === 'powershell' && /^-(path|literalpath)$/i.test(a)) return args[j + 1];
    if (a === '-') return undefined;
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

function pathApiFor(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function normalizeDir(dir, { platform, homedir }) {
  let d = dir;
  if (d === '~' || d.startsWith('~/') || d.startsWith('~\\')) d = homedir + d.slice(1);
  if (platform === 'win32') d = d.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, drive) => `${drive.toUpperCase()}:`);
  return d;
}

const isGit = (tok) => /(^|[\\/])git(\.exe)?$/i.test(tok);

function messageFilesOf(args) {
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-F' || a === '--file' || a === '-t' || a === '--template' || /^-[a-zA-Z]+F$/.test(a)) {
      if (args[i + 1] !== undefined) files.push(args[i + 1]);
    } else if (a.startsWith('--file=')) files.push(a.slice(7));
    else if (a.startsWith('--template=')) files.push(a.slice(11));
    else if (/^-F./.test(a)) files.push(a.slice(2));
  }
  return files.filter((f) => f !== '-');
}

function hasMessageArg(args) {
  return args.some((a) => a === '--message' || a.startsWith('--message=') || a === '--file' || a.startsWith('--file=') || /^-[a-zA-Z]*[mF]/.test(a) && !a.startsWith('--'));
}

/** Every `git commit` / `git push` in the command, with the directory each one runs in. */
export function parseGitOps(command, cwd, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const homedir = opts.homedir ?? osHomedir();
  const shell = opts.shell === 'powershell' ? 'powershell' : 'bash';
  const api = pathApiFor(platform);
  const norm = (d) => normalizeDir(d, { platform, homedir });
  let current = api.resolve(cwd); // hook cwd is already native
  let explicit = false;
  const ops = [];

  for (const raw of splitSegments(command, shell)) {
    const toks = [...raw];
    while (toks.length && (/^[A-Za-z_]\w*=/.test(toks[0]) || WRAPPERS.has(toks[0]))) toks.shift();
    if (!toks.length) continue;

    const head = shell === 'powershell' ? toks[0].toLowerCase() : toks[0];
    if (DIR_CHANGERS[shell].has(head)) {
      const target = dirChangeTarget(toks.slice(1), shell);
      if (target !== undefined) {
        current = api.resolve(current, norm(target));
        explicit = true;
      }
      continue;
    }
    if (!isGit(toks[0])) continue;

    let dir = current;
    let opExplicit = explicit;
    let i = 1;
    let sub = null;
    while (i < toks.length) {
      const t = toks[i];
      if (t === '-C') {
        if (toks[i + 1] !== undefined) {
          dir = api.resolve(dir, norm(toks[i + 1]));
          opExplicit = true;
        }
        i += 2;
      } else if (VALUE_OPTIONS.has(t)) i += 2;
      else if (t.startsWith('-')) i += 1;
      else {
        sub = t;
        break;
      }
    }
    if (sub !== 'commit' && sub !== 'push') continue;
    const args = toks.slice(i + 1);
    ops.push({
      kind: sub,
      dir,
      explicit: opExplicit,
      messageFiles: sub === 'commit' ? messageFilesOf(args) : [],
      amendWithoutMessage: sub === 'commit' && args.includes('--amend') && !hasMessageArg(args),
    });
  }
  return ops;
}

const block = (reason) => ({ block: true, reason });
const TRAILER = /co-authored-by/i;

export function evaluate({ command, cwd, shell }, deps) {
  const ops = parseGitOps(command, cwd, { platform: deps.platform, homedir: deps.homedir, shell });
  if (ops.length === 0) return { block: false };

  const commits = ops.filter((o) => o.kind === 'commit');
  if (commits.length > 0) {
    const rule = 'UniJob rule: commits must not contain a Co-Authored-By trailer. Remove it and retry.';
    if (TRAILER.test(command)) return block(rule);
    for (const op of commits) {
      for (const f of op.messageFiles) {
        const resolved = pathApiFor(deps.platform ?? process.platform).resolve(op.dir, f);
        if (TRAILER.test(deps.readFile(resolved))) return block(rule);
      }
    }
  }

  for (const op of ops) {
    if (op.explicit && deps.exists && !deps.exists(op.dir)) {
      return block(`cannot verify CI for ${op.dir}: directory not found`);
    }
    let root;
    try {
      root = deps.repoRoot(op.dir);
    } catch {
      continue; // not a git repo: nothing to guard
    }

    if (op.amendWithoutMessage && deps.headMessage && TRAILER.test(deps.headMessage(root))) {
      return block('UniJob rule: HEAD message contains a Co-Authored-By trailer; --amend would keep it. Provide a clean -m message.');
    }

    const last = deps.readLastRun(root);
    const needed = op.kind === 'push' ? '--full' : '--quick';
    if (!last) return block(`No CI result in ${root}/ci/last-run.json. Run: node scripts/ci-local.mjs ${needed}`);
    if (!last.ok) {
      const failed = (last.gates ?? []).filter((g) => !g.ok).map((g) => g.name).join(', ');
      return block(`Last ci-local run failed (${failed || 'see ci/last-run.json'}). Fix it and re-run node scripts/ci-local.mjs ${needed}`);
    }

    if (op.kind === 'commit') {
      if (last.fingerprint !== deps.workingTreeFingerprint(root)) {
        return block('Code changed since the last ci-local run. Re-run: node scripts/ci-local.mjs --quick');
      }
      continue;
    }

    if (last.mode !== 'full') return block('Push needs a green full run. Run: node scripts/ci-local.mjs --full');
    if (last.fingerprint !== deps.headTree(root)) {
      return block('HEAD is not the tree that ci-local --full verified (uncommitted changes or new commits). Commit everything, then re-run --full.');
    }
  }
  return { block: false };
}

const realDeps = {
  repoRoot,
  workingTreeFingerprint,
  headTree,
  exists: existsSync,
  readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : ''),
  headMessage: (root) => git(root, ['log', '-1', '--format=%B']),
  readLastRun: (root) => {
    const p = path.join(root, 'ci', 'last-run.json');
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (err) {
      throw new Error(`corrupt ${p}: ${err.message}`);
    }
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const shell = { Bash: 'bash', PowerShell: 'powershell' }[input.tool_name];
    if (shell && typeof input.tool_input?.command === 'string') {
      // Git Bash style cwd (/c/Users/...) must become a native path before it is resolved
      const cwd = normalizeDir(input.cwd ?? process.cwd(), { platform: process.platform, homedir: osHomedir() });
      const verdict = evaluate({ command: input.tool_input.command, cwd, shell }, realDeps);
      if (verdict.block) {
        process.stderr.write(`[guard-commit] ${verdict.reason}\n`);
        process.exit(2);
      }
    }
  } catch (err) {
    process.stderr.write(`[guard-commit] internal error: ${err?.message ?? err} — blocking to be safe\n`);
    process.exit(2);
  }
}
