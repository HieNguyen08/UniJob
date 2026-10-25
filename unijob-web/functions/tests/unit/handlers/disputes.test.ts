import { describe, expect, it } from 'vitest';
import { DISPUTE_MSG, parseDisputeInput } from '../../../src/handlers/disputes.js';

const reason = 'Người làm chưa giao bài';

describe('parseDisputeInput', () => {
  it('returns the job id and the trimmed reason', () => {
    expect(parseDisputeInput({ jobId: 'j1', reason: `  ${reason}  ` })).toEqual({ jobId: 'j1', reason });
  });
  it('counts code points: 10 emoji pass, 500 pass, 501 fail', () => {
    expect(parseDisputeInput({ jobId: 'j1', reason: '😡'.repeat(10) }).reason).toBe('😡'.repeat(10));
    expect(parseDisputeInput({ jobId: 'j1', reason: 'a'.repeat(500) }).reason).toHaveLength(500);
    expect(() => parseDisputeInput({ jobId: 'j1', reason: 'a'.repeat(501) })).toThrow(DISPUTE_MSG.reasonLength);
  });
  it.each([
    ['too short after trimming', { jobId: 'j1', reason: '   short   ' }, DISPUTE_MSG.reasonLength],
    ['reason not a string', { jobId: 'j1', reason: 42 }, DISPUTE_MSG.reasonLength],
    ['missing reason', { jobId: 'j1' }, DISPUTE_MSG.reasonLength],
    ['jobId with a slash', { jobId: 'a/b', reason }, DISPUTE_MSG.invalid],
    ['missing jobId', { reason }, DISPUTE_MSG.invalid],
    ['not an object', 'j1', DISPUTE_MSG.invalid],
    ['null', null, DISPUTE_MSG.invalid],
  ])('rejects %s with invalid-argument', (_l, data, message) => {
    expect(() => parseDisputeInput(data)).toThrow(expect.objectContaining({ code: 'invalid-argument', message }));
  });
});
