#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) guard: no Co-Authored-By; commit only after a green ci-local run
// on the exact working tree; push only after a green --full run on the exact HEAD tree.
// Fails closed: any internal error exits 2 (the only exit code Claude Code treats as blocking).
// Accepted static-parsing limits: variable indirection (`g=git; $g commit`, `$GIT commit`) and
// user-defined git aliases (`git ci`) are not recognised as commit/push. GitHub branch protection
// on main and the push gate (green --full on the exact HEAD tree) are the backstop for those.
import { existsSync, readFileSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, headTree, repoRoot, workingTreeFingerprint } from '../../scripts/ci/git.mjs';

const SEPARATORS = new Set(['&', '|', ';', '\n', '(', ')']);
const SHELL_SPECIAL = new Set([' ', '\t', '"', "'", '$', '`', '\\', ';', '&', '|', '(', ')', '<', '>', '\n', '#', '*', '?']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'sudo', 'time', 'nohup', 'nice', 'builtin']);
const VALUE_OPTIONS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path', '--super-prefix', '--attr-source']);

/**
 * Quote-aware split of a command line into segments of tokens (quotes stripped).
 * `shell` is 'bash' (default) or 'powershell' (backtick escapes, literal backslashes,
 * '' / "" doubled quotes, @'…'@ / @"…"@ here-strings).
 */
export function splitSegments(command, shell = 'bash') {
  return splitDetailed(command, shell).map((s) => s.tokens);
}

/**
 * Token/segment accumulator shared by both splitters. Each segment records which of its tokens
 * hold an unquoted output redirect (`>`, `>>`, `2>&1`, `&>` …), so quoted text like "a > b" is not one,
 * and whether it holds a command substitution this parser cannot follow (`substitution`).
 */
function segmentBuilder() {
  const segments = [];
  let tokens = [];
  let redirects = [];
  let substitution = false;
  const b = {
    cur: '',
    has: false,
    redir: false,
    segments,
    substitute() {
      substitution = true;
    },
    add(text) {
      b.cur += text;
      b.has = true;
    },
    pushToken() {
      if (b.has) {
        if (b.redir) redirects.push(tokens.length);
        tokens.push(b.cur);
      }
      b.cur = '';
      b.has = false;
      b.redir = false;
    },
    endSegment() {
      b.pushToken();
      if (tokens.length || substitution) segments.push({ tokens, redirects, substitution });
      tokens = [];
      redirects = [];
      substitution = false;
    },
    /** Unquoted `>` at command[i]; an fd duplication (`>&1`, `>&-`) stays in the same token. Returns the new i. */
    redirect(command, i) {
      b.add('>');
      b.redir = true;
      if (command[i + 1] === '&') {
        b.add('&');
        i++;
        while (i + 1 < command.length && /[0-9-]/.test(command[i + 1])) b.add(command[++i]);
      }
      return i;
    },
  };
  return b;
}

const CAT_HEREDOC_OPEN = /^\$\(cat[ \t]+<<(-?)[ \t]*'(\w+)'[ \t]*\n/;

/**
 * Length of the documented commit-message form `$(cat <<'WORD' … WORD)` starting at command[i]
 * (the quoted delimiter means nothing in the body expands), or 0 when it is anything else.
 * Like bash, the body ends at the FIRST line exactly equal to WORD (leading tabs stripped for <<-);
 * after it only whitespace may come before the closing `)`.
 */
function catHeredocLength(command, i) {
  const open = CAT_HEREDOC_OPEN.exec(command.slice(i));
  if (!open) return 0;
  const [, dash, word] = open;
  let pos = i + open[0].length;
  while (pos <= command.length) {
    const nl = command.indexOf('\n', pos);
    const lineEnd = nl < 0 ? command.length : nl;
    const line = command.slice(pos, lineEnd);
    if ((dash ? line.replace(/^\t+/, '') : line) === word) {
      const close = /^[ \t\n]*\)/.exec(command.slice(lineEnd));
      return close ? lineEnd + close[0].length - i : 0;
    }
    if (nl < 0) return 0;
    pos = nl + 1;
  }
  return 0;
}

/** Like splitSegments, but each segment is `{ tokens, redirects, substitution }` (indexes of redirect tokens). */
function splitDetailed(command, shell = 'bash') {
  if (shell === 'powershell') return splitPowerShell(command);
  const b = segmentBuilder();
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else b.cur += c;
      continue;
    }
    if (quote === '"') {
      const next = command[i + 1];
      if (c === '\\' && next !== undefined && '"\\$`'.includes(next)) {
        b.cur += next;
        i++;
      } else if (c === '"') quote = null;
      else if (c === '$' && next === '(') {
        const len = catHeredocLength(command, i);
        if (len) {
          b.cur += command.slice(i, i + len);
          i += len - 1;
        } else {
          b.substitute();
          b.cur += c;
        }
      } else {
        if (c === '`') b.substitute();
        b.cur += c;
      }
      continue;
    }
    if (c === '\\') {
      const next = command[i + 1];
      if (next === '\n') i++;
      else if (next !== undefined && SHELL_SPECIAL.has(next)) {
        b.add(next);
        i++;
      } else b.add(c); // e.g. a Windows path C:\repo
    } else if (c === '"' || c === "'") {
      quote = c;
      b.has = true;
    } else if (c === ' ' || c === '\t' || c === '\r') b.pushToken();
    // bash starts a comment only at a word start after whitespace or a metacharacter (not after `{`, `}` or CR)
    else if (c === '#' && !b.has && (i === 0 || /[ \t\n;&|()]/.test(command[i - 1]))) {
      const nl = command.indexOf('\n', i); // comment: nothing up to the newline runs
      i = nl < 0 ? command.length : nl - 1;
    } else if (c === '>') i = b.redirect(command, i);
    else if (c === '&' && command[i + 1] === '>') b.add('&'); // `&> file` is a redirect, not a separator
    else if (c === '`') {
      b.substitute();
      b.add(c);
    } else if (SEPARATORS.has(c)) b.endSegment();
    else b.add(c);
  }
  b.endSegment();
  return b.segments;
}

function splitPowerShell(command) {
  const b = segmentBuilder();
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
      if (next === '"' && command.slice(bodyStart, end).includes('$(')) b.substitute(); // @"…"@ expands $(…)
      b.cur += command.slice(bodyStart, end);
      b.has = true;
      i = m ? m.index + m[0].length - 1 : command.length;
      continue;
    }
    if (c === "'") {
      b.has = true;
      for (i++; i < command.length; i++) {
        if (command[i] === "'") {
          if (command[i + 1] === "'") {
            b.cur += "'";
            i++;
          } else break;
        } else b.cur += command[i];
      }
      continue;
    }
    if (c === '"') {
      b.has = true;
      for (i++; i < command.length; i++) {
        const d = command[i];
        if (d === '`' && i + 1 < command.length) b.cur += command[++i];
        else if (d === '$' && command[i + 1] === '(') {
          b.substitute();
          b.cur += d;
        } else if (d === '"') {
          if (command[i + 1] === '"') {
            b.cur += '"';
            i++;
          } else break;
        } else b.cur += d;
      }
      continue;
    }
    if (c === '`') {
      if (next === '\n') i++; // line continuation
      else if (next === '\r' && command[i + 2] === '\n') i += 2;
      else if (next !== undefined) {
        b.cur += next;
        b.has = true;
        i++;
      }
    } else if (c === ' ' || c === '\t' || c === '\r') b.pushToken();
    else if (c === '>') i = b.redirect(command, i);
    else if (SEPARATORS.has(c) || c === '{' || c === '}') b.endSegment(); // script blocks: if (…) { git … }
    else {
      b.cur += c;
      b.has = true;
    }
  }
  b.endSegment();
  return b.segments;
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

// Leading shell keywords / block openers: the command that follows them is what runs.
// (Bash `{` `}` arrive as their own tokens; PowerShell `{` `}` `(` `)` are segment separators.)
const CONTROL_TOKENS = new Set(['if', 'then', 'else', 'elif', 'elseif', 'do', 'while', 'until', '!', '{', '}', 'try', 'finally', 'foreach']);
const NESTED_SHELLS = new Set(['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd']);
const NESTED_GIT_OP = /\bgit(\.exe)?\b[^|;&]*\b(commit|push)\b/i;

/** A segment that hands a command string to another interpreter, which this parser cannot follow. */
function isNestedShell(toks) {
  const base = toks[0].replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
  if (base === 'xargs' || base === 'invoke-expression' || base === 'iex') return true;
  return NESTED_SHELLS.has(base) && toks.slice(1).some((t) => /^-[a-z]*c$/i.test(t) || /^-command$/i.test(t) || /^\/c$/i.test(t));
}

/** Drops leading assignments, wrappers (env, sudo …) and shell keywords: what remains is the command that runs. */
function stripLead(raw, shell) {
  return splitLead(raw, shell).toks;
}

// Wrapper options that take the next token as their value (env -u NAME, sudo -u USER, nice -n N …).
const WRAPPER_VALUE_OPTIONS = new Set(['-u', '-C', '-S', '-g', '-n', '-o']);

/**
 * stripLead, also returning the `VAR=value` prefixes it dropped and the options given to wrappers
 * (`env -i`, `sudo --user root` …), which the caller cannot interpret and must treat as unknown.
 */
function splitLead(raw, shell) {
  const toks = [...raw];
  const assigns = [];
  const wrapperOpts = [];
  const lead = (t) => (shell === 'powershell' ? t.toLowerCase() : t);
  while (toks.length && (/^[A-Za-z_]\w*=/.test(toks[0]) || WRAPPERS.has(toks[0]) || CONTROL_TOKENS.has(lead(toks[0])))) {
    const t = toks.shift();
    if (/^[A-Za-z_]\w*=/.test(t)) assigns.push(t);
    else if (WRAPPERS.has(t)) {
      while (toks.length && toks[0].startsWith('-')) {
        const opt = toks.shift();
        wrapperOpts.push(opt);
        if (WRAPPER_VALUE_OPTIONS.has(opt) && toks.length) toks.shift();
      }
    }
  }
  return { toks, assigns, wrapperOpts };
}

/**
 * For a `git …` token list: the subcommand, its arguments, every `-C <dir>` in order, and every other
 * global option as `{ opt, value }` (`-cX`, `--opt=X` and `--opt X` forms).
 */
function gitSubcommand(toks) {
  const dirs = [];
  const globals = [];
  let i = 1;
  while (i < toks.length) {
    const t = toks[i];
    if (t === '-C') {
      if (toks[i + 1] !== undefined) dirs.push(toks[i + 1]);
      i += 2;
    } else if (VALUE_OPTIONS.has(t)) {
      globals.push({ opt: t, value: toks[i + 1] ?? '' });
      i += 2;
    } else if (t.startsWith('-')) {
      const eq = t.indexOf('=');
      if (/^-c./.test(t)) globals.push({ opt: '-c', value: t.slice(2) });
      else if (t.startsWith('--') && eq > 0) globals.push({ opt: t.slice(0, eq), value: t.slice(eq + 1) });
      else globals.push({ opt: t, value: '' });
      i += 1;
    } else return { sub: t, args: toks.slice(i + 1), dirs, globals };
  }
  return { sub: null, args: [], dirs, globals };
}

// Commands that may share a tool call with git commit/push: they cannot change the working tree.
const READ_ONLY_COMMANDS = new Set([
  'cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location',
  'echo', 'printf', 'pwd', 'true', 'ls', 'cat', 'head', 'tail', 'grep', 'wc',
]);
const READ_ONLY_CMDLETS = new Set([
  'select-object', 'select', 'select-string', 'sls', 'out-host', 'out-string', 'out-null', 'measure-object',
  'write-output', 'write-host', 'get-location', 'get-date',
]);
const READ_ONLY_GIT = new Set(['add', 'status', 'diff', 'log', 'show', 'rev-parse', 'branch']);
const BRANCH_LIST_FLAGS = new Set(['-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '-l', '--list', '--show-current', '--no-color', '--color']);
const ADD_FLAGS = new Set(['-A', '-u', '--all', '-n', '-v', '--dry-run', '--verbose']);
// Global git options that only switch something off; they cannot run code or move the repository.
const SAFE_FLAG_GLOBALS = new Set(['--no-pager', '-P', '--no-optional-locks', '--no-replace-objects', '--literal-pathspecs']);
const isSafeFlagGlobal = ({ opt, value }) => SAFE_FLAG_GLOBALS.has(opt) && value === '';
const PUSH_FLAGS = new Set([
  '-u', '--set-upstream', '--force-with-lease', '-f', '--force', '--tags', '--follow-tags', '--no-verify', '--dry-run', '-n',
  '-q', '--quiet', '-v', '--verbose', '--porcelain', '--delete', '-d', '--atomic',
]);
const SAFE_OP_ENV = /^(LANG|LC_\w+|TZ)=/;
const NULL_SINKS = { bash: new Set(['/dev/null']), powershell: new Set(['$null', 'nul']) };

/** True when a redirect token (plus the token after it) writes to a real file. */
function writesFile(tokens, idx, shell) {
  const t = tokens[idx];
  if (/^\d*>&(\d+|-)$/.test(t)) return false; // fd duplication such as 2>&1 or >&2
  let target = t.slice(t.lastIndexOf('>') + 1).replace(/^&/, '');
  if (target === '') target = tokens[idx + 1] ?? '';
  return !NULL_SINKS[shell].has(shell === 'powershell' ? target.toLowerCase() : target);
}

/** Arguments of a chained read-only git subcommand that make it run code or write files. */
function gitArgsChangeFiles(sub, args) {
  if (args.some((a) => a.startsWith('--output'))) return true;
  if (['diff', 'log', 'show'].includes(sub) && args.some((a) => a === '--ext-diff' || a === '--textconv')) return true;
  if (sub === 'branch') return !args.every((a) => BRANCH_LIST_FLAGS.has(a));
  if (sub === 'add') {
    const end = args.indexOf('--');
    return (end < 0 ? args : args.slice(0, end)).some((a) => a.startsWith('-') && !ADD_FLAGS.has(a) && !/^-[Aunv]+$/.test(a));
  }
  return false;
}

/**
 * Why the commit/push op itself may run code or act on another repository, or null.
 * Allowlists: env prefixes LANG, LC_xxx, TZ; globals -C, -c user.name/user.email and SAFE_FLAG_GLOBALS;
 * push options PUSH_FLAGS (any other option, including abbreviations like --exe=, is refused).
 */
function unsafeGitOp(sub, args, globals, assigns) {
  const env = assigns.find((a) => !SAFE_OP_ENV.test(a));
  if (env) return `${env.split('=')[0]}= prefix`;
  for (const g of globals) {
    if (g.opt === '-c' && /^user\.(name|email)=/i.test(g.value)) continue;
    if (!isSafeFlagGlobal(g)) return g.value ? `${g.opt} ${g.value}` : g.opt;
  }
  if (sub === 'push') {
    const bad = args.find((a) => a.startsWith('-') && !PUSH_FLAGS.has(a) && !/^--force-with-lease=/.test(a));
    if (bad) return bad;
  }
  return null;
}

/**
 * Why the git commit/push in this command cannot be trusted to commit what CI saw, or null:
 * a chained segment that may change files, a command substitution, or code-running git options.
 */
function chainProblem(command, shell) {
  const chained = (what) => `Run git commit/push in its own tool call: this command also runs "${what}", which may change files after the CI check.`;
  for (const { tokens, redirects, substitution } of splitDetailed(command, shell)) {
    if (substitution) {
      return `cannot verify a command substitution ($(…) or backticks) next to git commit/push; use plain quotes or -m "$(cat <<'EOF' … EOF)".`;
    }
    if (redirects.some((idx) => writesFile(tokens, idx, shell))) return chained(tokens.join(' '));
    const { toks, assigns, wrapperOpts } = splitLead(tokens, shell);
    if (wrapperOpts.length) return chained(tokens.join(' ')); // env -S '…', sudo -u …: the real command is opaque
    if (!toks.length) {
      if (assigns.length) return chained(assigns[0]);
      continue;
    }
    if (isGit(toks[0])) {
      const { sub, args, globals } = gitSubcommand(toks);
      if (sub === 'commit' || sub === 'push') {
        const unsafe = unsafeGitOp(sub, args, globals, assigns);
        if (unsafe) return `Remove "${unsafe}" from git ${sub}: options that can run code are not allowed on a guarded commit/push.`;
        continue;
      }
      const label = sub ? `${toks[0]} ${sub}` : toks[0];
      if (assigns.length) return chained(`${assigns[0]} ${label}`);
      if (!globals.every(isSafeFlagGlobal) || !READ_ONLY_GIT.has(sub) || gitArgsChangeFiles(sub, args)) return chained(label);
      continue;
    }
    if (assigns.length) return chained(`${assigns[0]} ${toks[0]}`);
    // PowerShell: a bare variable read such as $LASTEXITCODE or `$? -ne 0` (no assignment, no member call)
    if (shell === 'powershell' && /^\$[\w:?]+$/.test(toks[0]) && !toks.some((t) => t.includes('='))) continue;
    const head = toks[0].toLowerCase();
    if (READ_ONLY_COMMANDS.has(head) || (shell === 'powershell' && READ_ONLY_CMDLETS.has(head))) continue;
    return chained(toks[0]);
  }
  return null;
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
    const { toks, wrapperOpts } = splitLead(raw, shell);
    if (wrapperOpts.length && NESTED_GIT_OP.test(raw.join(' '))) {
      ops.push({ kind: 'wrapped', dir: current, explicit, messageFiles: [], amendWithoutMessage: false, detail: wrapperOpts[0] });
      continue;
    }
    if (!toks.length) continue;

    if (isNestedShell(toks) && NESTED_GIT_OP.test(toks.slice(1).join(' '))) {
      ops.push({ kind: 'nested', dir: current, explicit, messageFiles: [], amendWithoutMessage: false });
      continue;
    }

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

    const { sub, args, dirs } = gitSubcommand(toks);
    if (sub !== 'commit' && sub !== 'push') continue;
    let dir = current;
    for (const d of dirs) dir = api.resolve(dir, norm(d));
    ops.push({
      kind: sub,
      dir,
      explicit: explicit || dirs.length > 0,
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
  if (ops.some((o) => o.kind === 'nested')) {
    return block('cannot verify a git commit/push run through a nested shell (bash -c, cmd /c, pwsh -Command, xargs, Invoke-Expression); run git directly');
  }
  const wrapped = ops.find((o) => o.kind === 'wrapped');
  if (wrapped) {
    return block(`cannot verify a git commit/push behind wrapper option "${wrapped.detail}" (env -i/-C/-S, sudo -u …); run git directly`);
  }
  // The hook runs before the whole command, so anything chained with the commit/push could
  // change files after the CI fingerprint check passed.
  const problem = chainProblem(command, shell === 'powershell' ? 'powershell' : 'bash');
  if (problem !== null) return block(problem);

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
