import { describe, expect, it } from 'vitest';
import { MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER } from '../../src/lib/auth.js';
import {
  COMPLETION_MSG, completionParties, nextCompletionStep, parseCompletionInput, planWorkHistory, workHistoryIdFor,
} from '../../src/lib/completion.js';
import { toJobInfo } from '../../src/lib/jobs.js';

const job = { title: 'Nhập liệu', category: 'Gia sư', postedBy: 'p1', status: 'in-progress', assignedTo: ['w1'] };

describe('parseCompletionInput', () => {
  it('returns the job id', () => expect(parseCompletionInput({ jobId: 'j1' })).toEqual({ jobId: 'j1' }));
  it.each([['slash', { jobId: 'a/b' }], ['missing', {}], ['number', { jobId: 1 }], ['null', null], ['string', 'j1']])(
    'rejects %s with invalid-argument', (_l, data) => {
      expect(() => parseCompletionInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message: COMPLETION_MSG.invalid }));
    });
});

describe('completionParties', () => {
  it('poster and assigned worker get their role and the worker id', () => {
    expect(completionParties('j1', job, 'p1')).toMatchObject({ role: 'poster', workerId: 'w1', info: { postedBy: 'p1' } });
    expect(completionParties('j1', job, 'w1')).toMatchObject({ role: 'worker', workerId: 'w1' });
  });
  it.each([
    ['missing job', undefined, 'p1', 'not-found', MSG_JOB_NOT_FOUND],
    ['outsider (even on a completed job)', { ...job, status: 'completed' }, 'mallory', 'permission-denied', MSG_NOT_MEMBER],
    ['second assignee', { ...job, assignedTo: ['w1', 'w2'] }, 'w2', 'permission-denied', MSG_NOT_MEMBER],
    ['completed job', { ...job, status: 'completed' }, 'p1', 'failed-precondition', COMPLETION_MSG.alreadyCompleted],
    ['open job', { ...job, status: 'open' }, 'p1', 'failed-precondition', COMPLETION_MSG.notInProgress],
    ['cancelled job', { ...job, status: 'cancelled' }, 'w1', 'failed-precondition', COMPLETION_MSG.notInProgress],
    ['no worker', { ...job, assignedTo: [] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
    ['worker id with a slash', { ...job, assignedTo: ['a/b'] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
    ['poster is the worker', { ...job, assignedTo: ['p1'] }, 'p1', 'failed-precondition', COMPLETION_MSG.noWorker],
  ])('%s -> %s', (_l, data, uid, code, message) => {
    expect(() => completionParties('j1', data, uid)).toThrow(expect.objectContaining({ code, message }));
  });
});

describe('nextCompletionStep', () => {
  const doc = (workerConfirmed: unknown, posterConfirmed: unknown, status = 'pending', source: string | null = 'server') => ({ jobId: 'j1', workerConfirmed, posterConfirmed, status, ...(source === null ? {} : { source, serverVersion: 'completion-v1' }) });
  it('worker on no doc creates a pending record', () => {
    expect(nextCompletionStep('worker', undefined, 'j1')).toEqual({ write: true, create: true, state: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
  });
  it('poster on no doc is failed-precondition (worker first)', () => {
    expect(() => nextCompletionStep('poster', undefined, 'j1')).toThrow(expect.objectContaining({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst }));
  });
  it('own flag already true, other side not: no write (idempotent)', () => {
    expect(nextCompletionStep('worker', doc(true, false), 'j1')).toEqual({ write: false, state: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
    expect(nextCompletionStep('poster', doc(false, true), 'j1')).toEqual({ write: false, state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
  it.each([
    ['poster second', 'poster', doc(true, false)],
    ['worker second (poster flag set on a server doc)', 'worker', doc(false, true)],
    ['a repeat on a confirmed server doc, poster', 'poster', doc(true, true, 'confirmed')],
    ['a repeat on a confirmed server doc, worker', 'worker', doc(true, true, 'confirmed')],
  ] as const)('%s -> confirmed', (_l, role, current) => {
    expect(nextCompletionStep(role, current, 'j1')).toEqual({ write: true, create: false, state: { status: 'confirmed', workerConfirmed: true, posterConfirmed: true } });
  });
  it('poster on a server doc with both flags false records only the poster', () => {
    expect(nextCompletionStep('poster', doc(false, false), 'j1')).toEqual({ write: true, create: false, state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
  it.each([['no source', null], ['source "client"', 'client']])('a doc with %s is untrusted: treated as absent', (_l, source) => {
    const forged = doc(true, true, 'confirmed', source);
    expect(() => nextCompletionStep('poster', forged, 'j1')).toThrow(expect.objectContaining({ code: 'failed-precondition', message: COMPLETION_MSG.workerFirst }));
    expect(nextCompletionStep('worker', doc(false, true, 'pending', source), 'j1')).toEqual({ write: true, create: true, state: { status: 'pending', workerConfirmed: true, posterConfirmed: false } });
  });
  it('a source-server doc without the version marker is untrusted', () => {
    const noMarker: Record<string, unknown> = { ...doc(true, true, 'confirmed') };
    delete noMarker.serverVersion;
    expect(() => nextCompletionStep('poster', noMarker, 'j1')).toThrow(expect.objectContaining({ message: COMPLETION_MSG.workerFirst }));
  });
  it('a server doc whose jobId is not its id is untrusted', () => {
    expect(() => nextCompletionStep('poster', { ...doc(true, true, 'confirmed'), jobId: 'other' }, 'j1')).toThrow(expect.objectContaining({ message: COMPLETION_MSG.workerFirst }));
  });
  it('junk flag values count as false', () => {
    expect(nextCompletionStep('poster', doc('true', false), 'j1')).toMatchObject({ state: { status: 'pending', workerConfirmed: false, posterConfirmed: true } });
  });
});

describe('work history', () => {
  it('id is `${jobId}_${workerId}`', () => expect(workHistoryIdFor('j1', 'w1')).toBe('j1_w1'));
  it('builds the server record with a safe title', () => {
    const data = { ...job, title: 'Xem www.evil.com' };
    expect(planWorkHistory(toJobInfo('j1', data)!, data, 'w1')).toEqual({
      user1: 'p1', user2: 'w1', jobId: 'j1', jobTitle: 'Xem [liên kết]', category: 'Gia sư', source: 'server', serverVersion: 'completion-v1',
    });
  });
  it('a non-string category becomes ""', () => {
    const data = { ...job, category: 42 };
    expect(planWorkHistory(toJobInfo('j1', data)!, data, 'w1').category).toBe('');
  });
});

