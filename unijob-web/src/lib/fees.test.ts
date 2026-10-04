import { describe, expect, it } from 'vitest';
import { calculatePlatformFee } from '@/lib/fees';

describe('calculatePlatformFee', () => {
  it('is 0 for volunteer and non-positive amounts', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(-50_000)).toBe(0);
  });

  it('charges 3% below 200,000', () => {
    expect(calculatePlatformFee(100_000)).toBe(3_000);
    expect(calculatePlatformFee(199_999)).toBe(6_000);
  });

  it('charges 5% from 200,000 up to and including 1,000,000', () => {
    expect(calculatePlatformFee(200_000)).toBe(10_000);
    expect(calculatePlatformFee(1_000_000)).toBe(50_000);
  });

  it('charges 4% above 1,000,000', () => {
    expect(calculatePlatformFee(1_000_001)).toBe(40_000);
    expect(calculatePlatformFee(2_500_000)).toBe(100_000);
  });

  it('rounds to whole VND', () => {
    expect(Number.isInteger(calculatePlatformFee(123_457))).toBe(true);
  });
});
