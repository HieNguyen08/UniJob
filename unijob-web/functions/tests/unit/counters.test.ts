import { describe, expect, it } from 'vitest';
import { countersRelevant, planCounters } from '../../src/lib/counters.js';

const job = (status: string, assignedTo: string[] = ['w1']) => ({ postedBy: 'p1', status, assignedTo });

describe('planCounters', () => {
  it('in-progress with no marker: +1 for the worker', () =>
    expect(planCounters('j1', job('in-progress'), undefined)).toEqual({ next: { activeWorker: 'w1', completedWorker: null }, active: [{ uid: 'w1', delta: 1 }], completed: null }));
  it('same state again: nothing to change', () =>
    expect(planCounters('j1', job('in-progress'), { activeWorker: 'w1', completedWorker: null })).toBeNull());
  it('completed: -1 active and +1 completed, once', () => {
    expect(planCounters('j1', job('completed'), { activeWorker: 'w1', completedWorker: null })).toEqual({ next: { activeWorker: null, completedWorker: 'w1' }, active: [{ uid: 'w1', delta: -1 }], completed: 'w1' });
    expect(planCounters('j1', job('completed'), { activeWorker: null, completedWorker: 'w1' })).toBeNull();
  });
  it('legacy in-progress job completing without a marker: +1 completed only', () =>
    expect(planCounters('j1', job('completed'), undefined)).toMatchObject({ active: [], completed: 'w1' }));
  it.each([['open (worker cancel)', job('open', [])], ['cancelled', job('cancelled')]])('%s: -1 for the previous worker', (_l, j) =>
    expect(planCounters('j1', j, { activeWorker: 'w1', completedWorker: null })).toMatchObject({ active: [{ uid: 'w1', delta: -1 }], completed: null }));
  it('worker swapped while in progress: -1 old, +1 new', () =>
    expect(planCounters('j1', job('in-progress', ['w2']), { activeWorker: 'w1', completedWorker: null })?.active).toEqual([{ uid: 'w1', delta: -1 }, { uid: 'w2', delta: 1 }]));
  it.each([['poster as worker', job('in-progress', ['p1'])], ['bad id', job('in-progress', ['a/b'])], ['open, no marker', job('open', [])]])(
    '%s: nothing to count', (_l, j) => expect(planCounters('j1', j, undefined)).toBeNull());
  it('a junk marker counts as empty', () =>
    expect(planCounters('j1', job('in-progress'), { activeWorker: 5, completedWorker: 'a/b' })).toMatchObject({ active: [{ uid: 'w1', delta: 1 }] }));
  it('no job: nothing to change', () => expect(planCounters('j1', undefined, undefined)).toBeNull());
});

describe('countersRelevant', () => {
  it('is true only when status or the first assignee changed', () => {
    expect(countersRelevant(job('open', []), job('in-progress'))).toBe(true);
    expect(countersRelevant(job('in-progress'), { ...job('in-progress'), title: 'x' })).toBe(false);
    expect(countersRelevant(job('in-progress', ['w1']), job('in-progress', ['w2']))).toBe(true);
    expect(countersRelevant(undefined, job('open'))).toBe(false);
  });
});
