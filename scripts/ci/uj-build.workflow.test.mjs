import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SOURCE = readFileSync(new URL('../../.claude/workflows/uj-build.js', import.meta.url), 'utf8')
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
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)));
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
