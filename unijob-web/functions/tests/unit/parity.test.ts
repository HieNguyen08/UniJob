import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { calculatePlatformFee as webFee } from '../../../src/lib/fees.ts';
import type { NotificationType as WebNotificationType } from '../../../src/types/notification.ts';
import { CANCEL_REASONS } from '../../src/lib/cancel.js';
import { calculatePlatformFee } from '../../src/lib/fees.js';
import type { NotificationType } from '../../src/lib/types.js';

const AMOUNTS = [-1, 0, 0.4, 1, 33, 199_999, 200_000, 200_001, 999_999, 1_000_000, 1_000_001, 12_345_678, Number.NaN];

describe('parity with the web app', () => {
  it.each(AMOUNTS)('calculatePlatformFee(%d) equals the web copy', (amount) => {
    expect(calculatePlatformFee(amount)).toEqual(webFee(amount));
  });

  // 6a adds 'worker_cancelled' server-side only; slice 6b adds it to the web union and restores strict equality.
  it('NotificationType equals the web union plus worker_cancelled', () => {
    expectTypeOf<NotificationType>().toEqualTypeOf<WebNotificationType | 'worker_cancelled'>();
  });

  it('CANCEL_REASONS equals the CancelReason union in the web cancel service', () => {
    // Read as text: importing the service would pull Firebase and the '@/' alias into this package's typecheck.
    const src = readFileSync(new URL('../../../src/services/cancel.service.ts', import.meta.url), 'utf8');
    const union = /export type CancelReason =([^;]+);/.exec(src)?.[1] ?? '';
    const web = [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(web.length).toBeGreaterThan(0);
    expect([...CANCEL_REASONS]).toEqual(web);
  });
});
