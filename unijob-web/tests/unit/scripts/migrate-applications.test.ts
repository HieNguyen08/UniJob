import { describe, expect, it } from 'vitest';
import { applyBlockReason, planMigration } from '../../../scripts/migrate-applications-plan.ts';

// stands in for a Firestore Timestamp (duck-typed by toMillis)
const ts = (ms: number) => ({ toMillis: () => ms });
const TS = ts(0);

const app = (id: string, jobId: string, applicantId: string, status = 'pending') => ({
  id,
  data: { jobId, applicantId, status, applicantName: 'An', applicantPhoto: '', message: 'hi', createdAt: TS } as Record<string, unknown> & {
    jobId: string;
    applicantId: string;
    status: string;
  },
});
const clean = (jobId: string, applicantId: string, status = 'pending') => ({
  jobId,
  applicantId,
  status,
  applicantName: 'An',
  applicantPhoto: '',
  message: 'hi',
  createdAt: TS,
});

describe('planMigration', () => {
  it('leaves canonical applications alone', () => {
    const plan = planMigration([app('j1_u1', 'j1', 'u1')], [{ id: 'j1', applicants: ['u1'] }]);
    expect(plan.creates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.backfills).toEqual([]);
  });

  it('copies a random-id application to the deterministic id and deletes the old one', () => {
    const plan = planMigration(
      [app('rand1', 'j1', 'u1', 'accepted')],
      [{ id: 'j1', applicants: ['u1'], assignedTo: ['u1'] }]
    );
    expect(plan.creates).toEqual([{ id: 'j1_u1', data: clean('j1', 'u1', 'accepted') }]);
    expect(plan.deletes).toEqual(['rand1']);
  });

  it('deletes an identical legacy duplicate of an existing deterministic doc', () => {
    const plan = planMigration([app('rand1', 'j1', 'u1'), app('j1_u1', 'j1', 'u1')], [{ id: 'j1', applicants: ['u1'] }]);
    expect(plan.creates).toEqual([]);
    expect(plan.deletes).toEqual(['rand1']);
    expect(plan.conflicts).toEqual([]);
  });

  it('keeps a legacy doc that differs from the existing deterministic doc as a conflict', () => {
    const plan = planMigration(
      [app('rand1', 'j1', 'u1', 'accepted'), app('j1_u1', 'j1', 'u1', 'pending')],
      [{ id: 'j1', applicants: ['u1'] }]
    );
    expect(plan.creates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({ id: 'rand1', legacyStatus: 'accepted', targetStatus: 'pending' });
  });

  it('migrates one of several legacy duplicates and reports differing ones as conflicts', () => {
    const plan = planMigration(
      [app('a', 'j1', 'u1', 'rejected'), app('b', 'j1', 'u1', 'pending'), app('c', 'j1', 'u1', 'pending')],
      [{ id: 'j1', applicants: ['u1'] }]
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].data.status).toBe('pending');
    expect([...plan.deletes].sort()).toEqual(['b', 'c']);
    expect(plan.conflicts.map((c) => c.id)).toEqual(['a']);
  });

  it('backfills applicants for pending applications and assigned accepted ones only', () => {
    const plan = planMigration(
      [
        app('j1_u1', 'j1', 'u1', 'pending'),
        app('j1_u2', 'j1', 'u2', 'accepted'),
        app('j1_u3', 'j1', 'u3', 'rejected'),
        app('j1_u4', 'j1', 'u4'),
        app('j1_u5', 'j1', 'u5', 'accepted'),
      ],
      [{ id: 'j1', applicants: ['u4'], assignedTo: ['u2'] }]
    );
    expect(plan.backfills).toEqual([{ jobId: 'j1', add: ['u1', 'u2'] }]);
  });

  it('reports an accepted application whose uid is not assigned as a conflict, not a backfill', () => {
    const plan = planMigration([app('j1_u5', 'j1', 'u5', 'accepted')], [{ id: 'j1', applicants: [], assignedTo: [] }]);
    expect(plan.backfills).toEqual([]);
    expect(plan.conflicts).toEqual([
      expect.objectContaining({ id: 'j1_u5', legacyStatus: 'accepted', reason: expect.any(String) }),
    ]);
  });

  it('initialises a missing or non-array applicants field to an empty list', () => {
    const plan = planMigration(
      [],
      [
        { id: 'j3' },
        { id: 'j4', applicants: [] },
        { id: 'j5', applicants: null as unknown as string[] },
        { id: 'j6', applicants: 'x' as unknown as string[] },
      ]
    );
    expect(plan.backfills).toEqual([
      { jobId: 'j3', add: [] },
      { jobId: 'j5', add: [] },
      { jobId: 'j6', add: [] },
    ]);
  });

  it('treats a non-array applicants field as empty when adding uids', () => {
    const plan = planMigration([app('j1_u1', 'j1', 'u1')], [{ id: 'j1', applicants: 'u1' as unknown as string[] }]);
    expect(plan.backfills).toEqual([{ jobId: 'j1', add: ['u1'] }]);
  });

  describe('validation of legacy applications', () => {
    const jobs = [{ id: 'j1', applicants: [] }];
    const invalidOf = (apps: ReturnType<typeof app>[]) => planMigration(apps, jobs);

    it('rejects a missing job', () => {
      const plan = invalidOf([app('r', 'nope', 'u1')]);
      expect(plan.invalid.map((i) => i.id)).toEqual(['r']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
    });
    it('rejects empty, non-string or malformed jobId / applicantId', () => {
      const bad = [
        app('r1', '', 'u1'),
        app('r2', 'j1', ''),
        app('r3', 'j1', 'u_1'),
        app('r4', 'j1', 'a/b'),
        app('r5', 'j1', 'x'.repeat(129)),
        { id: 'r6', data: { jobId: 5 as unknown as string, applicantId: 'u1', status: 'pending' } },
        { id: 'r7', data: { jobId: 'j1', applicantId: null as unknown as string, status: 'pending' } },
      ];
      const plan = invalidOf(bad);
      expect(plan.invalid.map((i) => i.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
    });
    it('rejects an unknown or missing status', () => {
      const plan = invalidOf([app('r1', 'j1', 'u1', 'weird'), { id: 'r2', data: { jobId: 'j1', applicantId: 'u2' } as never }]);
      expect(plan.invalid.map((i) => i.id).sort()).toEqual(['r1', 'r2']);
    });
    it('does not backfill from invalid applications', () => {
      expect(invalidOf([app('r1', 'j1', 'u1', 'weird')]).backfills).toEqual([]);
    });
  });

  describe('hardening of legacy applications', () => {
    const jobs = [{ id: 'j1', postedBy: 'p1', applicants: [], assignedTo: ['u9'] }];
    const withData = (id: string, extra: Record<string, unknown>) => {
      const a = app(id, 'j1', 'u1');
      return { id, data: { ...a.data, ...extra } };
    };

    it('rebuilds the migrated doc from the allowlist and drops every other key', () => {
      const u = ts(5);
      const a = withData('r', { updatedAt: u, isAdmin: true, payment: 999 });
      const plan = planMigration([a], jobs);
      expect(plan.creates).toEqual([{ id: 'j1_u1', data: { ...clean('j1', 'u1'), updatedAt: u } }]);
      expect(plan.deletes).toEqual(['r']);
    });

    it.each([
      ['applicantName not a string', { applicantName: 5 }],
      ['applicantName missing', { applicantName: undefined }],
      ['applicantName longer than 100', { applicantName: 'x'.repeat(101) }],
      ['applicantPhoto not https', { applicantPhoto: 'http://evil.example/x.png' }],
      ['applicantPhoto javascript url', { applicantPhoto: 'javascript:alert(1)' }],
      ['applicantPhoto longer than 2048', { applicantPhoto: 'https://' + 'x'.repeat(2041) }],
      ['applicantPhoto not a string', { applicantPhoto: null }],
      ['message not a string', { message: 7 }],
      ['message longer than 1000', { message: 'x'.repeat(1001) }],
    ])('reports %s as invalid and leaves it untouched', (_name, extra) => {
      const plan = planMigration([withData('r', extra)], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['r']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
      expect(plan.backfills).toEqual([]);
    });

    it('accepts boundary values (name 100, https photo 2048, message 1000)', () => {
      const a = withData('r', {
        applicantName: 'x'.repeat(100),
        applicantPhoto: 'https://' + 'x'.repeat(2040),
        message: 'x'.repeat(1000),
      });
      const plan = planMigration([a], jobs);
      expect(plan.invalid).toEqual([]);
      expect(plan.creates).toHaveLength(1);
    });

    it('rejects a legacy application by the job poster', () => {
      const plan = planMigration([app('r', 'j1', 'p1')], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['r']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
    });

    it('migrates an accepted legacy application only when the uid is assigned', () => {
      const plan = planMigration([app('r', 'j1', 'u9', 'accepted')], jobs);
      expect(plan.creates).toEqual([{ id: 'j1_u9', data: clean('j1', 'u9', 'accepted') }]);
      expect(plan.deletes).toEqual(['r']);
    });

    it('leaves an accepted legacy application whose uid is not assigned untouched as a conflict', () => {
      const plan = planMigration([app('r', 'j1', 'u1', 'accepted')], jobs);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
      expect(plan.backfills).toEqual([]);
      expect(plan.conflicts).toEqual([
        expect.objectContaining({ id: 'r', target: 'j1_u1', legacyStatus: 'accepted', targetStatus: null }),
      ]);
    });

    it('migrates rejected and pending legacy applications as-is', () => {
      const plan = planMigration([app('r1', 'j1', 'u1', 'rejected'), app('r2', 'j1', 'u2', 'pending')], jobs);
      expect([...plan.creates].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
        { id: 'j1_u1', data: clean('j1', 'u1', 'rejected') },
        { id: 'j1_u2', data: clean('j1', 'u2', 'pending') },
      ]);
      expect([...plan.deletes].sort()).toEqual(['r1', 'r2']);
    });
  });

  describe('validation of canonical applications', () => {
    const jobs = [{ id: 'j1', postedBy: 'p1', applicants: [] }];

    it('reports an invalid canonical doc without modifying or backfilling from it', () => {
      const bad = { id: 'j1_u1', data: { ...app('x', 'j1', 'u1').data, applicantPhoto: 'http://x' } };
      const plan = planMigration([bad], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['j1_u1']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
      expect(plan.backfills).toEqual([]);
    });

    it('reports a canonical doc by the poster as invalid', () => {
      const plan = planMigration([app('j1_p1', 'j1', 'p1')], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['j1_p1']);
      expect(plan.backfills).toEqual([]);
    });

    it('does not migrate a legacy doc onto an invalid canonical doc', () => {
      const bad = { id: 'j1_u1', data: { ...app('x', 'j1', 'u1').data, message: 5 } };
      const plan = planMigration([bad, app('r', 'j1', 'u1')], jobs);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
      expect(plan.conflicts.map((c) => c.id)).toEqual(['r']);
    });
  });

  describe('timestamps', () => {
    const jobs = [{ id: 'j1', postedBy: 'p1', applicants: [] }];
    const withData = (id: string, extra: Record<string, unknown>) => ({ id, data: { ...app(id, 'j1', 'u1').data, ...extra } });

    it.each([
      ['createdAt missing', { createdAt: undefined }],
      ['createdAt a string', { createdAt: '2024-01-01' }],
      ['createdAt a plain map', { createdAt: { seconds: 1, nanoseconds: 0 } }],
      ['updatedAt a string', { updatedAt: '2024-01-01' }],
      ['updatedAt a plain map', { updatedAt: { seconds: 1, nanoseconds: 0 } }],
    ])('reports a legacy doc with %s as invalid', (_n, extra) => {
      const plan = planMigration([withData('r', extra)], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['r']);
      expect(plan.creates).toEqual([]);
    });

    it('reports a canonical doc with a bad createdAt as invalid', () => {
      const plan = planMigration([withData('j1_u1', { createdAt: 'x' })], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['j1_u1']);
      expect(plan.backfills).toEqual([]);
    });

    it('uses the injected isTimestamp predicate', () => {
      const plan = planMigration([withData('r', {})], jobs, { isTimestamp: () => false });
      expect(plan.invalid.map((i) => i.id)).toEqual(['r']);
      const ok = planMigration([withData('r', { createdAt: 'T' })], jobs, { isTimestamp: (v) => v === 'T' });
      expect(ok.invalid).toEqual([]);
      expect(ok.creates).toHaveLength(1);
    });

    it('treats different timestamps as different data', () => {
      const plan = planMigration([withData('j1_u1', { createdAt: ts(1) }), withData('r', { createdAt: ts(2) })], jobs);
      expect(plan.deletes).toEqual([]);
      expect(plan.conflicts.map((c) => c.id)).toEqual(['r']);
    });
  });

  describe('canonical id checks', () => {
    const jobs = [
      { id: 'j1', postedBy: 'p1', applicants: [] },
      { id: 'j2', postedBy: 'p1', applicants: [] },
      { id: '5', postedBy: 'p1', applicants: [] },
    ];

    it('reports a doc squatting a deterministic id of another job as invalid and blocks that slot', () => {
      const squat = { id: 'j1_x', data: { ...app('j1_x', 'j2', 'x').data } };
      const plan = planMigration([squat, app('r', 'j1', 'x')], jobs);
      expect(plan.invalid.map((i) => i.id)).toEqual(['j1_x']);
      expect(plan.creates).toEqual([]);
      expect(plan.deletes).toEqual([]);
      expect(plan.conflicts.map((c) => c.id)).toEqual(['r']);
      expect(plan.backfills).toEqual([]);
    });

    it('runs the id checks on canonical docs', () => {
      const bad = [
        { id: 'j1_a_b', data: { ...app('x', 'j1', 'a_b').data } },
        { id: '5_u1', data: { ...app('x', 'j1', 'u1').data, jobId: 5 as unknown as string } },
      ];
      const plan = planMigration(bad, jobs);
      expect(plan.invalid.map((i) => i.id).sort()).toEqual(['5_u1', 'j1_a_b']);
      expect(plan.orphans).toEqual([]);
      expect(plan.backfills).toEqual([]);
    });
  });

  it('caps the backfill at 200 uids per job and reports the rest as conflicts', () => {
    const apps = Array.from({ length: 203 }, (_v, i) => {
      const uid = `u${String(i).padStart(3, '0')}`;
      return app(`j1_${uid}`, 'j1', uid);
    });
    const plan = planMigration(apps, [{ id: 'j1', postedBy: 'p1', applicants: [] }]);
    expect(plan.backfills).toHaveLength(1);
    expect(plan.backfills[0].add).toHaveLength(200);
    expect(plan.conflicts.map((c) => c.id)).toEqual(['j1_u200', 'j1_u201', 'j1_u202']);
  });

  describe('applyBlockReason', () => {
    const empty = planMigration([], []);
    it('allows apply when there are no conflicts or invalid docs', () => {
      expect(applyBlockReason(empty, false)).toBeNull();
    });
    it('blocks apply while conflicts or invalid docs exist, unless forced', () => {
      const withConflict = { ...empty, conflicts: [{ id: 'a', target: 'b', legacyStatus: 'pending', targetStatus: null, reason: 'x' }] };
      const withInvalid = { ...empty, invalid: [{ id: 'a', reason: 'x' }] };
      expect(applyBlockReason(withConflict, false)).toMatch(/--force-with-report/);
      expect(applyBlockReason(withInvalid, false)).toMatch(/--force-with-report/);
      expect(applyBlockReason(withInvalid, true)).toBeNull();
    });
  });
});
