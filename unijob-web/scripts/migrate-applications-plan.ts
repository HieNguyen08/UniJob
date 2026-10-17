export interface AppDoc {
  id: string;
  data: { jobId: string; applicantId: string; status: string; [key: string]: unknown };
}
export interface JobDoc {
  id: string;
  postedBy?: string;
  applicants?: string[];
  assignedTo?: string[];
}
export interface Conflict {
  id: string;
  target: string;
  legacyStatus: string;
  targetStatus: string | null;
  reason: string;
}
export interface MigrationPlan {
  creates: { id: string; data: AppDoc['data'] }[];
  deletes: string[];
  backfills: { jobId: string; add: string[] }[];
  orphans: string[];
  conflicts: Conflict[];
  invalid: { id: string; reason: string }[];
}

const STATUSES = ['pending', 'accepted', 'rejected'];
const STATUS_RANK: Record<string, number> = { accepted: 0, pending: 1, rejected: 2 };
const rank = (status: string) => STATUS_RANK[status] ?? 3;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/** Max uids added to one job's applicants by a single migration; the rest are reported. */
export const MAX_BACKFILL_PER_JOB = 200;

export interface PlanOptions {
  /** True for a Firestore Timestamp; the .mjs injects `instanceof Timestamp` (firebase-admin). */
  isTimestamp?: (value: unknown) => boolean;
}
const looksLikeTimestamp = (v: unknown) =>
  typeof v === 'object' && v !== null && typeof (v as { toMillis?: unknown }).toMillis === 'function';
// the only keys firestore.rules applications.create allows
const ALLOWED_KEYS = ['jobId', 'applicantId', 'applicantName', 'applicantPhoto', 'message', 'status', 'createdAt', 'updatedAt'];

/** Rebuilds an application from the allowlist; every other key is dropped. */
function sanitize(data: AppDoc['data']): AppDoc['data'] {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) if (data[key] !== undefined) out[key] = data[key];
  return out as AppDoc['data'];
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    looksLikeTimestamp(v)
      ? { __timestampMillis: (v as { toMillis: () => number }).toMillis() }
      : v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : v
  );
}

function idShapeReason(a: AppDoc): string | null {
  const { jobId, applicantId } = a.data;
  if (typeof jobId !== 'string' || !ID_RE.test(jobId)) return 'jobId is not a valid id';
  if (typeof applicantId !== 'string' || !ID_RE.test(applicantId) || applicantId.includes('_')) {
    return 'applicantId is not a valid uid';
  }
  return null;
}

function idReason(a: AppDoc, jobIds: Set<string>): string | null {
  return idShapeReason(a) ?? (jobIds.has(a.data.jobId) ? null : 'job does not exist');
}

/** Same field checks as firestore.rules applications.create, plus no self-application. */
function fieldReason(data: AppDoc['data'], job: JobDoc, isTimestamp: (v: unknown) => boolean): string | null {
  const { status, applicantName, applicantPhoto, message, createdAt, updatedAt } = data;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return 'unknown status';
  if (typeof applicantName !== 'string' || applicantName.length > 100) return 'applicantName is not a string of at most 100 chars';
  if (
    typeof applicantPhoto !== 'string' ||
    applicantPhoto.length > 2048 ||
    (applicantPhoto !== '' && !applicantPhoto.startsWith('https://'))
  ) {
    return "applicantPhoto is not '' or an https:// URL of at most 2048 chars";
  }
  if (typeof message !== 'string' || message.length > 1000) return 'message is not a string of at most 1000 chars';
  if (!isTimestamp(createdAt)) return 'createdAt is not a Timestamp';
  if (updatedAt !== undefined && !isTimestamp(updatedAt)) return 'updatedAt is not a Timestamp';
  if (data.applicantId === job.postedBy) return 'applicant is the job poster';
  return null;
}

const isAssigned = (job: JobDoc, uid: string) => Array.isArray(job.assignedTo) && job.assignedTo.includes(uid);

/**
 * Pure planner: which applications to re-key to `${jobId}_${applicantId}`,
 * which legacy docs to delete, which job.applicants to backfill, and what to
 * leave untouched (conflicts / invalid). The Admin SDK bypasses rules and the
 * legacy data was written under open rules, so nothing here is trusted: migrated
 * docs are rebuilt from the rules' allowlist and pass the same field checks as
 * applications.create; accepted docs migrate only when the uid is in assignedTo.
 */
export function planMigration(apps: AppDoc[], jobs: JobDoc[], options: PlanOptions = {}): MigrationPlan {
  const isTimestamp = options.isTimestamp ?? looksLikeTimestamp;
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const jobIds = new Set(jobById.keys());
  const creates: MigrationPlan['creates'] = [];
  const deletes: string[] = [];
  const conflicts: Conflict[] = [];
  const invalid: MigrationPlan['invalid'] = [];
  // deterministic docs that exist or will exist after the migration
  const effective = new Map<string, AppDoc['data']>();
  const isCanonical = (a: AppDoc) => a.id === `${a.data.jobId}_${a.data.applicantId}`;

  // canonical docs that fail validation: reported, never modified, never a migration target
  const invalidCanonical = new Set<string>();

  // a non-canonical doc whose id has the shape `${existingJobId}_${uid}` squats that job's slot
  const squatsSlot = (a: AppDoc) => {
    const cut = a.id.lastIndexOf('_');
    return cut > 0 && cut < a.id.length - 1 && jobIds.has(a.id.slice(0, cut));
  };

  for (const a of apps) {
    if (isCanonical(a) || !squatsSlot(a)) continue;
    invalid.push({ id: a.id, reason: 'id has the deterministic shape but jobId/applicantId do not match it' });
    invalidCanonical.add(a.id);
  }

  for (const a of apps) {
    if (!isCanonical(a)) continue;
    const job = jobById.get(a.data.jobId);
    // missing job (with a well-formed id) -> orphan below
    const reason = idShapeReason(a) ?? (job ? fieldReason(a.data, job, isTimestamp) : null);
    if (reason) {
      invalid.push({ id: a.id, reason });
      invalidCanonical.add(a.id);
    } else {
      effective.set(a.id, a.data);
    }
  }

  const legacy: AppDoc[] = [];
  for (const a of apps) {
    if (isCanonical(a) || invalidCanonical.has(a.id)) continue;
    const reason = idReason(a, jobIds) ?? fieldReason(a.data, jobById.get(a.data.jobId)!, isTimestamp);
    if (reason) invalid.push({ id: a.id, reason });
    else legacy.push(a);
  }
  legacy.sort((x, y) => rank(x.data.status) - rank(y.data.status));

  for (const a of legacy) {
    const target = `${a.data.jobId}_${a.data.applicantId}`;
    const data = sanitize(a.data);
    const current = effective.get(target);
    const conflict = (reason: string) =>
      conflicts.push({
        id: a.id,
        target,
        legacyStatus: a.data.status,
        targetStatus: current && typeof current.status === 'string' ? current.status : null,
        reason,
      });
    if (invalidCanonical.has(target)) {
      conflict('deterministic doc exists and is invalid');
    } else if (a.data.status === 'accepted' && !isAssigned(jobById.get(a.data.jobId)!, a.data.applicantId)) {
      conflict('accepted but uid is not in the job assignedTo; not migrated');
    } else if (!current) {
      creates.push({ id: target, data });
      effective.set(target, data);
      deletes.push(a.id);
    } else if (stable(sanitize(current)) === stable(data)) {
      deletes.push(a.id);
    } else {
      conflict('deterministic doc exists with different data');
    }
  }

  const wanted = new Map<string, Set<string>>();
  const orphans: string[] = [];
  for (const [id, data] of effective) {
    const job = jobById.get(data.jobId);
    if (!job) {
      orphans.push(id);
      continue;
    }
    if (data.status === 'pending') {
      if (!wanted.has(data.jobId)) wanted.set(data.jobId, new Set());
      wanted.get(data.jobId)!.add(data.applicantId);
    } else if (data.status === 'accepted') {
      if (isAssigned(job, data.applicantId)) {
        if (!wanted.has(data.jobId)) wanted.set(data.jobId, new Set());
        wanted.get(data.jobId)!.add(data.applicantId);
      } else {
        // only canonical docs reach here: unassigned accepted legacy docs are never migrated
        conflicts.push({
          id,
          target: id,
          legacyStatus: 'accepted',
          targetStatus: 'accepted',
          reason: 'accepted but uid is not in the job assignedTo; not promoted to applicants',
        });
      }
    }
  }

  const backfills: MigrationPlan['backfills'] = [];
  for (const [jobId, uids] of wanted) {
    const job = jobById.get(jobId)!;
    const have = new Set(Array.isArray(job.applicants) ? job.applicants : []);
    const all = [...uids].filter((u) => typeof u === 'string' && !have.has(u)).sort();
    const add = all.slice(0, MAX_BACKFILL_PER_JOB);
    for (const uid of all.slice(MAX_BACKFILL_PER_JOB)) {
      const id = `${jobId}_${uid}`;
      const status = effective.get(id)?.status;
      conflicts.push({
        id,
        target: id,
        legacyStatus: typeof status === 'string' ? status : 'unknown',
        targetStatus: typeof status === 'string' ? status : null,
        reason: `backfill cap of ${MAX_BACKFILL_PER_JOB} uids per job exceeded; not added to applicants`,
      });
    }
    if (add.length > 0) backfills.push({ jobId, add });
  }
  // jobs whose applicants is not an array get an empty list so applying is not rejected
  for (const j of jobs) {
    if (!Array.isArray(j.applicants) && !backfills.some((b) => b.jobId === j.id)) {
      backfills.push({ jobId: j.id, add: [] });
    }
  }
  return { creates, deletes, backfills, orphans, conflicts, invalid };
}

/**
 * Why `--apply` must not run: any CONFLICT or INVALID entry needs a human review first,
 * unless the operator passes `--force-with-report`. Null when applying is allowed.
 */
export function applyBlockReason(plan: MigrationPlan, force: boolean): string | null {
  if (force || (plan.conflicts.length === 0 && plan.invalid.length === 0)) return null;
  return (
    `Refusing to --apply: ${plan.conflicts.length} conflict(s) and ${plan.invalid.length} invalid doc(s) need review. ` +
    'Resolve them, or re-run with --apply --force-with-report to migrate the rest and leave them untouched.'
  );
}
