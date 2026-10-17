import { describe, expect, it } from 'vitest';
import { planMigration } from '../../../scripts/migrate-applications-plan.ts';

const app = (id: string, jobId: string, applicantId: string, status = 'pending') => ({
  id,
  data: { jobId, applicantId, status },
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
    expect(plan.creates).toEqual([{ id: 'j1_u1', data: { jobId: 'j1', applicantId: 'u1', status: 'accepted' } }]);
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
});
