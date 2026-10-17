import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SOURCE = readFileSync(new URL('../../../.claude/workflows/uj-build.js', import.meta.url), 'utf8')
  .replace(/^export const meta\s*=/m, 'const meta =');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const ARGS = { worktree: '/wt', plan: 'docs/plans/p.md', branch: 'feat/p', tasks: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] };
const done = { status: 'done', baseSha: 'b', headSha: 'h', files: ['x.ts'], summary: 's' };
const finding = (over = {}) => ({ severity: 'high', confidence: 90, file: 'x.ts', line: 1, issue: 'bug', suggestedFix: 'fix', ...over });

async function runWorkflow(handlers, args = ARGS) {
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ type: opts.agentType, label: opts.label, prompt });
    const h = handlers[opts.agentType];
    return h ? h(prompt, opts, calls) : { findings: [] };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t()));
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SOURCE);
  const result = await fn(agent, parallel, undefined, () => {}, () => {}, args, { total: null });
  return { result, calls, count: (t) => calls.filter((c) => c.type === t).length };
}

const green = { 'uj-implementer': () => done, 'uj-ci-runner': () => ({ ok: true, failures: [] }) };

test('happy path: every task implemented once, reviewed once, CI + branch review', async () => {
  const { result, count } = await runWorkflow(green);
  assert.equal(result.status, 'done');
  assert.equal(result.tasks.length, 2);
  assert.equal(count('uj-implementer'), 2);
  assert.equal(count('uj-code-reviewer'), 3); // 2 tasks + branch review
  assert.equal(count('uj-security-auditor'), 3);
  assert.equal(count('pr-review-toolkit:pr-test-analyzer'), 1);
  assert.equal(count('uj-ci-runner'), 1);
});

test('blocking finding is fixed, then only the reviewer that raised it re-reviews', async () => {
  let codeReviews = 0;
  const { result, calls } = await runWorkflow({
    ...green,
    'uj-code-reviewer': () => ({ findings: codeReviews++ === 0 ? [finding()] : [] }),
  }, { ...ARGS, tasks: [{ id: 1, title: 'A' }] });
  assert.equal(result.status, 'done');
  assert.equal(result.tasks[0].rounds, 1);
  assert.equal(result.tasks[0].fixed, 1);
  const task1 = calls.filter((c) => c.label?.endsWith(':t1'));
  assert.deepEqual(task1.map((c) => c.type), [
    'uj-implementer', 'uj-code-reviewer', 'uj-security-auditor', 'uj-implementer', 'uj-code-reviewer',
  ]);
});

test('findings that never go away stop the run as needs-human after maxRounds fixes', async () => {
  const { result, count } = await runWorkflow({
    ...green,
    'uj-security-auditor': () => ({ findings: [finding({ severity: 'critical' })] }),
  }, { ...ARGS, maxRounds: 3 });
  assert.equal(result.status, 'needs-human');
  assert.equal(result.stoppedAt, 1);
  assert.equal(count('uj-implementer'), 1 + 3);
  assert.equal(result.blocking.length, 1);
});

test('low severity or low confidence findings do not loop but are kept (deduped) as follow-ups', async () => {
  const { result, count } = await runWorkflow({
    ...green,
    'uj-code-reviewer': () => ({ findings: [finding({ severity: 'low' }), finding({ confidence: 60, issue: 'maybe' })] }),
  });
  assert.equal(result.status, 'done');
  assert.equal(count('uj-implementer'), 2);
  assert.equal(result.followUps.length, 2);
});

test('blocked implementer stops before any review', async () => {
  const { result, count } = await runWorkflow({ ...green, 'uj-implementer': () => ({ ...done, status: 'blocked', blockedReason: 'plan unclear' }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'plan unclear');
  assert.equal(count('uj-code-reviewer'), 0);
});

test('a reviewer that dies (null) is an error, not a clean review', async () => {
  const { result } = await runWorkflow({ ...green, 'uj-security-auditor': () => null });
  assert.equal(result.status, 'error');
});

test('CI red after 2 fix rounds → needs-human', async () => {
  const { result, count } = await runWorkflow({ ...green, 'uj-ci-runner': () => ({ ok: false, failures: [{ gate: 'build', cause: 'x', files: [] }] }) });
  assert.equal(result.status, 'needs-human');
  assert.equal(count('uj-ci-runner'), 3);
  assert.equal(result.ci.ok, false);
});

test('missing args fail fast', async () => {
  const { result } = await runWorkflow(green, { tasks: [] });
  assert.equal(result.status, 'error');
});

test('reviewer prompts are READ-ONLY and carry no Co-Authored-By wording; implementer prompts keep it', async () => {
  const { calls } = await runWorkflow(green);
  const reviewers = calls.filter((c) => c.type !== 'uj-implementer' && c.type !== 'uj-ci-runner');
  assert.ok(reviewers.length > 0);
  for (const c of reviewers) {
    assert.match(c.prompt, /READ-ONLY/);
    assert.doesNotMatch(c.prompt, /Co-Authored-By/);
  }
  const impls = calls.filter((c) => c.type === 'uj-implementer');
  assert.ok(impls.length > 0);
  for (const c of impls) assert.match(c.prompt, /Co-Authored-By/);
});

test('null implementer during the CI fix loop is an error, not blocked', async () => {
  const { result } = await runWorkflow({
    ...green,
    'uj-implementer': (p, o) => (o.label.startsWith('fix-ci') ? null : done),
    'uj-ci-runner': () => ({ ok: false, failures: [{ gate: 'build', cause: 'x', files: [] }] }),
  });
  assert.equal(result.status, 'error');
});

test('null ci-runner after branch-review fixes is an error', async () => {
  let branchCode = 0;
  let ciRuns = 0;
  const { result } = await runWorkflow({
    ...green,
    'uj-code-reviewer': (p, o) => ({ findings: o.label === 'branch-code' && branchCode++ === 0 ? [finding()] : [] }),
    'uj-ci-runner': () => (ciRuns++ === 0 ? { ok: true, failures: [] } : null),
  });
  assert.equal(result.status, 'error');
});

test('an implementer that throws yields a structured error result', async () => {
  const { result } = await runWorkflow({ ...green, 'uj-implementer': () => { throw new Error('boom'); } });
  assert.equal(result.status, 'error');
  assert.ok(Array.isArray(result.tasks));
  assert.ok(Array.isArray(result.followUps));
});

test('a reviewer returning no findings array is an error', async () => {
  const { result } = await runWorkflow({ ...green, 'uj-code-reviewer': () => ({}) });
  assert.equal(result.status, 'error');
});

test('null reviewer during branch review is an error', async () => {
  const { result } = await runWorkflow({ ...green, 'uj-security-auditor': (p, o) => (o.label.startsWith('branch-') ? null : { findings: [] }) });
  assert.equal(result.status, 'error');
});

test('branch review blocking finding: one fix, then CI re-runs', async () => {
  let branchCode = 0;
  const { result, count } = await runWorkflow({
    ...green,
    'uj-code-reviewer': (p, o) => ({ findings: o.label === 'branch-code' && branchCode++ === 0 ? [finding()] : [] }),
  });
  assert.equal(result.status, 'done');
  assert.equal(count('uj-ci-runner'), 2);
  assert.equal(count('uj-implementer'), 3);
});

test('CI red once then green: one fix-ci, done', async () => {
  let ciRuns = 0;
  const { result, calls, count } = await runWorkflow({
    ...green,
    'uj-ci-runner': () => (ciRuns++ === 0 ? { ok: false, failures: [{ gate: 'build', cause: 'x', files: [] }] } : { ok: true, failures: [] }),
  });
  assert.equal(result.status, 'done');
  assert.equal(count('uj-ci-runner'), 2);
  assert.equal(calls.filter((c) => c.label?.startsWith('fix-ci')).length, 1);
});

test('implementer reporting done without a new commit stops with error (implement)', async () => {
  const { result, count } = await runWorkflow({ ...green, 'uj-implementer': () => ({ ...done, headSha: 'b' }) });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /without a new commit/);
  assert.equal(count('uj-code-reviewer'), 0);
});

test('implementer reporting done without a new commit stops with error (review fix)', async () => {
  const { result } = await runWorkflow({
    ...green,
    'uj-implementer': (p, o) => (o.label.startsWith('fix-') ? { ...done, baseSha: 'h', headSha: 'h' } : done),
    'uj-code-reviewer': () => ({ findings: [finding()] }),
  });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /without a new commit/);
});

test('implementer reporting done without a new commit stops with error (CI fix)', async () => {
  const { result, count } = await runWorkflow({
    ...green,
    'uj-implementer': (p, o) => (o.label.startsWith('fix-ci') ? { ...done, baseSha: 'h', headSha: 'h' } : done),
    'uj-ci-runner': () => ({ ok: false, failures: [{ gate: 'build', cause: 'x', files: [] }] }),
  });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /without a new commit/);
  assert.equal(count('uj-ci-runner'), 1);
});

test('resume with no tasks skips implementation and runs CI + branch review', async () => {
  const { result, count } = await runWorkflow(green, { ...ARGS, tasks: [], resume: true });
  assert.equal(result.status, 'done');
  assert.equal(count('uj-implementer'), 0);
  assert.equal(count('uj-ci-runner'), 1);
  assert.equal(count('pr-review-toolkit:pr-test-analyzer'), 1);
});

test('empty tasks without resume is still an error', async () => {
  const { result, count } = await runWorkflow(green, { ...ARGS, tasks: [] });
  assert.equal(result.status, 'error');
  assert.equal(count('uj-ci-runner'), 0);
});
