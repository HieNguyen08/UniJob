import { describe, expect, it } from 'vitest';
import { calculatePlatformFee } from '../../src/lib/fees.js';

describe('calculatePlatformFee', () => {
  it('is 0 for volunteer (0đ) and negative amounts', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(-50_000)).toBe(0);
  });

  it('is 3% under 200,000đ', () => {
    expect(calculatePlatformFee(100_000)).toBe(3_000);
    expect(calculatePlatformFee(199_999)).toBe(6_000);
  });

  it('is 5% from 200,000đ to 1,000,000đ inclusive', () => {
    expect(calculatePlatformFee(200_000)).toBe(10_000);
    expect(calculatePlatformFee(1_000_000)).toBe(50_000);
  });

  it('is 4% above 1,000,000đ', () => {
    expect(calculatePlatformFee(1_000_001)).toBe(40_000);
    expect(calculatePlatformFee(5_000_000)).toBe(200_000);
  });
});
