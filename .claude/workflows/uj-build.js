export const meta = {
  name: 'uj-build',
  description: 'UniJob build loop: implement plan tasks (TDD), code+security review, bounded fix rounds, full CI, branch review',
  whenToUse: 'Run by /uj-build after a plan is approved and its worktree exists. Not for ad-hoc use.',
  phases: [
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'CI' },
    { title: 'Branch review' },
  ],
}

const A = args || {}
const WT = A.worktree
const PLAN = A.plan
const TASKS = Array.isArray(A.tasks) ? A.tasks : []
const MAX_ROUNDS = typeof A.maxRounds === 'number' ? A.maxRounds : 3
const MAX_CI_ROUNDS = 2
const MIN_CONFIDENCE = 80
const BLOCKING_SEVERITIES = ['critical', 'high', 'medium']

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          file: { type: 'string' },
          line: { type: 'number' },
          issue: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['severity', 'confidence', 'file', 'issue', 'suggestedFix'],
      },
    },
  },
  required: ['findings'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    baseSha: { type: 'string' },
    headSha: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    blockedReason: { type: 'string' },
  },
  required: ['status', 'baseSha', 'headSha', 'files', 'summary'],
}

const CI_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { gate: { type: 'string' }, cause: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
        required: ['gate', 'cause', 'files'],
      },
    },
  },
  required: ['ok', 'failures'],
}

const REVIEWERS = {
  code: { agentType: 'uj-code-reviewer', focus: 'correctness bugs, regressions in callers, mismatch with the plan task' },
  security: { agentType: 'uj-security-auditor', focus: 'Firebase rules, trusted fields written by the client, auth/validation, secrets, XSS' },
  tests: { agentType: 'pr-review-toolkit:pr-test-analyzer', focus: 'missing or weak tests for the behaviour this branch adds' },
  failures: { agentType: 'pr-review-toolkit:silent-failure-hunter', focus: 'swallowed errors and misleading fallbacks' },
}

const CONTEXT = `Worktree (work ONLY here, use absolute paths and git -C): ${WT}
Plan: ${PLAN} (read it inside the worktree)
Repo rules: CLAUDE.md. Never add a Co-Authored-By trailer.`

const key = (f) => `${f.file}:${f.line ?? '?'}:${f.issue}`
const isBlocking = (f) => BLOCKING_SEVERITIES.includes(f.severity) && f.confidence >= MIN_CONFIDENCE

const followUps = []
const seenFollowUps = new Set()
function keepFollowUps(findings) {
  for (const f of findings) {
    if (isBlocking(f) || seenFollowUps.has(key(f))) continue
    seenFollowUps.add(key(f))
    followUps.push(f)
  }
}

const results = []
const stop = (status, extra) => ({ status, tasks: results, followUps, ...extra })

function implement(task) {
  return agent(
    `${CONTEXT}\n\nImplement plan task ${task.id}: "${task.title}". Follow the task's steps exactly (TDD), run node scripts/ci-local.mjs --quick until green, then make a checkpoint commit whose message ends with [task:${task.id}].`,
    { label: `implement:t${task.id}`, phase: 'Implement', agentType: 'uj-implementer', schema: IMPL_SCHEMA },
  )
}

function fix(label, instructions) {
  return agent(
    `${CONTEXT}\n\n${instructions}\nFix only what is listed. Run node scripts/ci-local.mjs --quick until green, then make a checkpoint commit.`,
    { label, phase: 'Fix', agentType: 'uj-implementer', schema: IMPL_SCHEMA },
  )
}

function review(kind, range, what, label, phaseName) {
  const r = REVIEWERS[kind]
  return agent(
    `${CONTEXT}\n\nReview the diff \`git -C ${WT} diff ${range}\` (${what}). Focus: ${r.focus}. Return findings with severity and confidence (0-100). Empty list if nothing real.`,
    { label, phase: phaseName, agentType: r.agentType, schema: FINDINGS_SCHEMA },
  ).then((res) => (res ? { kind, findings: res.findings.map((f) => ({ ...f, reviewer: kind })) } : null))
}

async function reviewUntilClean(kinds, range, what, labelFor, phaseName, maxRounds, fixLabelFor) {
  let active = kinds
  let rounds = 0
  let fixed = 0
  for (;;) {
    const reviews = await parallel(active.map((k) => () => review(k, range(), what, labelFor(k), phaseName)))
    if (reviews.some((r) => !r)) return { error: `reviewer ${active[reviews.findIndex((r) => !r)]} returned nothing` }
    const all = reviews.flatMap((r) => r.findings)
    keepFollowUps(all)
    const blocking = all.filter(isBlocking)
    if (blocking.length === 0) return { rounds, fixed }
    if (rounds >= maxRounds) return { needsHuman: true, blocking, rounds, fixed }
    const res = await fix(fixLabelFor(rounds + 1), `Fix these review findings:\n${JSON.stringify(blocking, null, 2)}`)
    if (!res) return { error: 'implementer returned nothing during fix' }
    if (res.status === 'blocked') return { blocked: res.blockedReason || 'blocked during fix' }
    fixed += blocking.length
    rounds += 1
    active = [...new Set(blocking.map((f) => f.reviewer))]
  }
}

if (!WT || !PLAN || TASKS.length === 0) {
  return stop('error', { reason: 'uj-build needs args {worktree, plan, branch, tasks:[{id,title}]}' })
}

for (const task of TASKS) {
  phase('Implement')
  const impl = await implement(task)
  if (!impl) return stop('error', { stoppedAt: task.id, reason: 'implementer returned nothing' })
  if (impl.status === 'blocked') return stop('blocked', { stoppedAt: task.id, reason: impl.blockedReason || 'blocked' })

  const outcome = await reviewUntilClean(
    ['code', 'security'],
    () => `${impl.baseSha}..HEAD`,
    `plan task ${task.id}: ${task.title}`,
    (k) => `review-${k}:t${task.id}`,
    'Review',
    MAX_ROUNDS,
    (n) => `fix-r${n}:t${task.id}`,
  )
  if (outcome.error) return stop('error', { stoppedAt: task.id, reason: outcome.error })
  if (outcome.blocked) return stop('blocked', { stoppedAt: task.id, reason: outcome.blocked })
  if (outcome.needsHuman) return stop('needs-human', { stoppedAt: task.id, blocking: outcome.blocking })
  results.push({ id: task.id, title: task.title, rounds: outcome.rounds, fixed: outcome.fixed, status: 'done' })
  log(`task ${task.id} done (${outcome.rounds} fix round(s))`)
}

phase('CI')
const runCi = (n) => agent(
  `${CONTEXT}\n\nRun node scripts/ci-local.mjs --full in the worktree root and report.`,
  { label: `ci-full#${n}`, phase: 'CI', agentType: 'uj-ci-runner', schema: CI_SCHEMA },
)
let ci = await runCi(0)
for (let n = 1; ci && !ci.ok && n <= MAX_CI_ROUNDS; n++) {
  const res = await fix(`fix-ci#${n}`, `Full CI failed. Failures:\n${JSON.stringify(ci.failures, null, 2)}\nAlso read ci/last-run.json.`)
  if (!res || res.status === 'blocked') return stop('blocked', { reason: 'implementer could not fix CI', ci })
  ci = await runCi(n)
}
if (!ci) return stop('error', { reason: 'ci-runner returned nothing' })
if (!ci.ok) return stop('needs-human', { reason: 'full CI still red', ci })

phase('Branch review')
const branch = await reviewUntilClean(
  ['code', 'security', 'tests', 'failures'],
  () => 'main...HEAD',
  'the whole branch',
  (k) => `branch-${k}`,
  'Branch review',
  1,
  (n) => `fix-branch-r${n}`,
)
if (branch.error) return stop('error', { reason: branch.error, ci })
if (branch.blocked) return stop('blocked', { reason: branch.blocked, ci })
if (branch.needsHuman) return stop('needs-human', { reason: 'branch review still has blocking findings', blocking: branch.blocking, ci })

if (branch.rounds > 0) {
  ci = await runCi(99)
  if (!ci || !ci.ok) return stop('needs-human', { reason: 'full CI red after branch-review fixes', ci })
}

return stop('done', { ci })
