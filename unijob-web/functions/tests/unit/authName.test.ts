import { describe, expect, it, vi } from 'vitest';
import { makeAuthNameOf } from '../../src/lib/authName.js';

const authWith = (getUser: (uid: string) => Promise<unknown>) => ({ getUser }) as never;
const nameOf = (record: Record<string, unknown>) => makeAuthNameOf(authWith(async () => record))('u1');
const google = (displayName: unknown, email: unknown = 'an.nguyen@hcmut.edu.vn') => ({ providerId: 'google.com', uid: 'g1', displayName, email });
const hcmut = { email: 'an.nguyen@hcmut.edu.vn', emailVerified: true };

describe('makeAuthNameOf', () => {
  it('uses the trimmed Google name of a verified HCMUT account, never the client-writable top-level displayName', async () => {
    const getUser = vi.fn(async () => ({
      ...hcmut,
      displayName: 'Phòng Đào tạo HCMUT', // set by the client via updateProfile
      providerData: [{ providerId: 'password', uid: 'x', displayName: 'Khác' }, google('  Nguyễn Văn An  ')],
    }));
    await expect(makeAuthNameOf(authWith(getUser))('u1')).resolves.toBe('Nguyễn Văn An');
    expect(getUser).toHaveBeenCalledWith('u1');
  });
  it('matches the HCMUT domain case-insensitively', async () => {
    await expect(nameOf({ email: 'An@HCMUT.edu.vn', emailVerified: true, providerData: [google('An', 'an@hcmut.EDU.vn')] })).resolves.toBe('An');
  });
  it.each([
    ['no Google provider', { ...hcmut, displayName: 'Spoof', providerData: [] }],
    ['a blank Google name', { ...hcmut, providerData: [google('  ')] }],
    ['a non-string Google name', { ...hcmut, providerData: [google(42)] }],
    ['a provider email that is not HCMUT', { ...hcmut, providerData: [google('Phòng Đào tạo', 'pdt@gmail.com')] }],
    ['a provider without email', { ...hcmut, providerData: [google('Phòng Đào tạo', null)] }],
  ])('falls back to the verified HCMUT email local part with %s', async (_label, record) => {
    await expect(nameOf(record)).resolves.toBe('an.nguyen');
  });
  it.each([
    ['a personal Google account (any name)', { email: 'an@gmail.com', emailVerified: true, providerData: [google('Phòng Đào tạo HCMUT', 'an@gmail.com')] }],
    ['an unverified HCMUT email', { email: 'an@hcmut.edu.vn', emailVerified: false, providerData: [google('Phòng Đào tạo HCMUT', 'an@hcmut.edu.vn')] }],
    ['a look-alike domain', { email: 'an@evil-hcmut.edu.vn', emailVerified: true }],
    ['a subdomain trick', { email: 'an@hcmut.edu.vn.evil.com', emailVerified: true }],
    ['no email and no provider', { displayName: 'Spoof' }],
  ])('returns "" for %s', async (_label, record) => {
    await expect(nameOf(record)).resolves.toBe('');
  });
  it('returns "" (no throw) when the user does not exist or Auth fails', async () => {
    const notFound = Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    await expect(makeAuthNameOf(authWith(async () => Promise.reject(notFound)))('ghost')).resolves.toBe('');
    await expect(makeAuthNameOf(authWith(async () => Promise.reject(new Error('unavailable'))))('u1')).resolves.toBe('');
  });
});
