import { describe, expect, expectTypeOf, it } from 'vitest';
import { calculatePlatformFee as webFee } from '../../../src/lib/fees.ts';
import type { NotificationType as WebNotificationType } from '../../../src/types/notification.ts';
import { calculatePlatformFee } from '../../src/lib/fees.js';
import type { NotificationType } from '../../src/lib/types.js';

const AMOUNTS = [-1, 0, 0.4, 1, 33, 199_999, 200_000, 200_001, 999_999, 1_000_000, 1_000_001, 12_345_678, Number.NaN];

describe('parity with the web app', () => {
  it.each(AMOUNTS)('calculatePlatformFee(%d) equals the web copy', (amount) => {
    expect(calculatePlatformFee(amount)).toEqual(webFee(amount));
  });

  it('NotificationType equals the web union', () => {
    expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType>();
  });
});
