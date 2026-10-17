/**
 * Copy of unijob-web/src/lib/fees.ts. Functions deploy from functions/ only, so they cannot import web code.
 * Keep both identical: tests/unit/parity.test.ts compares them across every tier boundary.
 *
 * Tính phí nền tảng theo bậc:
 * - Volunteer / 0đ: 0%
 * - < 200,000đ:     3%
 * - 200,000–1,000,000đ: 5%
 * - > 1,000,000đ:   4%
 */
export function calculatePlatformFee(amount: number): number {
  if (amount <= 0) return 0;
  if (amount < 200_000) return Math.round(amount * 0.03);
  if (amount <= 1_000_000) return Math.round(amount * 0.05);
  return Math.round(amount * 0.04);
}
