export interface AppDoc {
  id: string;
  data: { jobId: string; applicantId: string; status: string; [key: string]: unknown };
}
export interface JobDoc {
  id: string;
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

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

function invalidReason(a: AppDoc, jobIds: Set<string>): string | null {
  const { jobId, applicantId, status } = a.data;
  if (typeof jobId !== 'string' || !ID_RE.test(jobId)) return 'jobId is not a valid id';
  if (typeof applicantId !== 'string' || !ID_RE.test(applicantId) || applicantId.includes('_')) {
    return 'applicantId is not a valid uid';
  }
  if (!jobIds.has(jobId)) return 'job does not exist';
  if (typeof status !== 'string' || !STATUSES.includes(status)) return 'unknown status';
  return null;
}

/**
 * Pure planner: which applications to re-key to `${jobId}_${applicantId}`,
 * which legacy docs to delete, which job.applicants to backfill, and what to
 * leave untouched (conflicts / invalid). The Admin SDK bypasses rules and the
 * legacy data was written under open rules, so nothing here is trusted.
 */
export function planMigration(apps: AppDoc[], jobs: JobDoc[]): MigrationPlan {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const jobIds = new Set(jobById.keys());
  const byId = new Map(apps.map((a) => [a.id, a]));
  const creates: MigrationPlan['creates'] = [];
  const deletes: string[] = [];
  const conflicts: Conflict[] = [];
  const invalid: MigrationPlan['invalid'] = [];
  // deterministic docs that exist or will exist after the migration
  const effective = new Map<string, AppDoc['data']>();
  const isCanonical = (a: AppDoc) => a.id === `${a.data.jobId}_${a.data.applicantId}`;

  for (const a of apps) if (isCanonical(a)) effective.set(a.id, a.data);

  const legacy: AppDoc[] = [];
  for (const a of apps) {
    if (isCanonical(a)) continue;
    const reason = invalidReason(a, jobIds);
    if (reason) invalid.push({ id: a.id, reason });
    else legacy.push(a);
  }
  legacy.sort((x, y) => rank(x.data.status) - rank(y.data.status));

  for (const a of legacy) {
    const target = `${a.data.jobId}_${a.data.applicantId}`;
    const current = effective.get(target);
    if (!current) {
      creates.push({ id: target, data: a.data });
      effective.set(target, a.data);
      deletes.push(a.id);
    } else if (stable(current) === stable(a.data)) {
      deletes.push(a.id);
    } else {
      conflicts.push({
        id: a.id,
        target,
        legacyStatus: a.data.status,
        targetStatus: typeof current.status === 'string' ? current.status : null,
        reason: 'deterministic doc exists with different data',
      });
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
      const assigned = Array.isArray(job.assignedTo) && job.assignedTo.includes(data.applicantId);
      if (assigned) {
        if (!wanted.has(data.jobId)) wanted.set(data.jobId, new Set());
        wanted.get(data.jobId)!.add(data.applicantId);
      } else if (!byId.has(id) || isCanonical(byId.get(id)!)) {
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
    const add = [...uids].filter((u) => !have.has(u)).sort();
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
