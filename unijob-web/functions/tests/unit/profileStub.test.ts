import { describe, expect, it } from 'vitest';
import { profileStub } from '../../src/lib/profileStub.js';

describe('profileStub', () => {
  it('has uid and zeroed server fields, overridable', () => {
    expect(profileStub('u1')).toEqual({ uid: 'u1', stub: true, ratingAverage: 0, totalRatings: 0, ratingScore: 0, penaltyPoints: 0, activeJobCount: 0, completedJobs: 0 });
    expect(profileStub('u1', { penaltyPoints: 5 }).penaltyPoints).toBe(5);
  });
});
