import { describe, expect, it } from 'vitest';
import { FALLBACK_JOB_TITLE, isDocId, readJob, toJobInfo } from '../../src/lib/jobs.js';
import { fakeDb } from '../support/fakeDb.js';

describe('isDocId', () => {
  it.each(['j1', 'job_abc', 'Nhập'])('accepts %s', (id) => expect(isDocId(id)).toBe(true));
  it.each([undefined, null, 42, '', 'a/b', '.', '..', '__x__', 'x'.repeat(701)])('rejects %s', (id) => expect(isDocId(id)).toBe(false));
});

describe('toJobInfo', () => {
  it('normalises fields and drops junk assignees', () => {
    expect(
      toJobInfo('j1', { title: 'T', postedBy: 'p', postedByName: 'Ẩn danh', assignedTo: ['w', 3, '', null], status: 'open' }),
    ).toEqual({ id: 'j1', title: 'T', postedBy: 'p', postedByName: 'Ẩn danh', assignedTo: ['w'], status: 'open' });
  });
  it('falls back to "công việc" for a missing or blank title', () => {
    expect(toJobInfo('j1', { title: '   ' })?.title).toBe(FALLBACK_JOB_TITLE);
    expect(toJobInfo('j1', {})?.title).toBe(FALLBACK_JOB_TITLE);
  });
  it('returns empty strings and [] for missing fields, null for missing data', () => {
    expect(toJobInfo('j1', {})).toEqual({ id: 'j1', title: FALLBACK_JOB_TITLE, postedBy: '', postedByName: '', assignedTo: [], status: '' });
    expect(toJobInfo('j1', undefined)).toBeNull();
  });
});

describe('readJob', () => {
  it('reads jobs/{id}', async () => {
    const db = fakeDb({ 'jobs/j1': { title: 'T', postedBy: 'p', status: 'open' } });
    await expect(readJob(db, 'j1')).resolves.toMatchObject({ id: 'j1', title: 'T', postedBy: 'p' });
  });
  it('is null for a missing job or an invalid id (no read)', async () => {
    const db = fakeDb();
    await expect(readJob(db, 'nope')).resolves.toBeNull();
    await expect(readJob(db, 'a/b')).resolves.toBeNull();
    await expect(readJob(db, undefined)).resolves.toBeNull();
  });
});
