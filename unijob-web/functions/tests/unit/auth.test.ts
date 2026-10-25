import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { assertMember, MSG_JOB_NOT_FOUND, MSG_NOT_MEMBER, MSG_NOT_VERIFIED, MSG_UNAUTHENTICATED, requireAuth, requireVerifiedMember } from '../../src/lib/auth.js';

function thrown(fn: () => unknown): HttpsError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return err as HttpsError;
  }
  throw new Error('expected an HttpsError');
}

const auth = (uid: string) => ({ auth: { uid, token: {} as never, rawToken: '' } });

describe('requireAuth', () => {
  it('returns the uid of a signed-in caller', () => {
    expect(requireAuth(auth('alice'))).toBe('alice');
  });

  it('throws unauthenticated with a Vietnamese message when auth is missing', () => {
    const err = thrown(() => requireAuth({ auth: undefined }));
    expect(err.code).toBe('unauthenticated');
    expect(err.message).toBe(MSG_UNAUTHENTICATED);
  });

  it('throws unauthenticated when auth.uid is empty', () => {
    expect(thrown(() => requireAuth(auth(''))).code).toBe('unauthenticated');
  });
});

describe('assertMember', () => {
  const job = { postedBy: 'poster', assignedTo: ['worker'] };

  it('returns poster for the job poster', () => {
    expect(assertMember(job, 'poster')).toBe('poster');
  });

  it('returns worker for an assigned worker', () => {
    expect(assertMember(job, 'worker')).toBe('worker');
  });

  it('returns poster when the poster is also listed in assignedTo', () => {
    expect(assertMember({ postedBy: 'p', assignedTo: ['p'] }, 'p')).toBe('poster');
  });

  it('treats a missing assignedTo as no workers', () => {
    expect(assertMember({ postedBy: 'poster' }, 'poster')).toBe('poster');
    expect(thrown(() => assertMember({ postedBy: 'poster' }, 'worker')).code).toBe('permission-denied');
  });

  it('throws permission-denied with a Vietnamese message for a non-member (e.g. an unassigned applicant)', () => {
    const err = thrown(() => assertMember(job, 'carol'));
    expect(err.code).toBe('permission-denied');
    expect(err.message).toBe(MSG_NOT_MEMBER);
  });

  it('throws permission-denied for an empty uid even if assignedTo contains an empty string', () => {
    expect(thrown(() => assertMember({ postedBy: 'poster', assignedTo: [''] }, '')).code).toBe('permission-denied');
  });

  it('throws not-found when the job is undefined', () => {
    const err = thrown(() => assertMember(undefined, 'poster'));
    expect(err.code).toBe('not-found');
    expect(err.message).toBe(MSG_JOB_NOT_FOUND);
  });
});

describe('requireVerifiedMember', () => {
  const token = (over: Record<string, unknown> = {}) => ({
    email: 'alice@hcmut.edu.vn',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...over,
  });
  const req = (uid: string, tok: unknown) => ({ auth: { uid, token: tok as never, rawToken: '' } });

  it('returns the uid of a verified HCMUT account', () => {
    expect(requireVerifiedMember(req('alice', token()))).toBe('alice');
  });

  it.each(['Alice@HCMUT.EDU.VN', '  alice@hcmut.edu.vn  '])('normalises case and spaces: %s', (email) => {
    expect(requireVerifiedMember(req('alice', token({ email })))).toBe('alice');
  });

  it('accepts a token without firebase.sign_in_provider (only anonymous is refused)', () => {
    expect(requireVerifiedMember(req('alice', token({ firebase: undefined })))).toBe('alice');
  });

  it('throws unauthenticated without auth or with an empty uid', () => {
    expect(thrown(() => requireVerifiedMember({ auth: undefined })).code).toBe('unauthenticated');
    expect(thrown(() => requireVerifiedMember(req('', token()))).code).toBe('unauthenticated');
  });

  it.each([
    ['missing token', undefined],
    ['unverified email', token({ email_verified: false })],
    ['email_verified missing', token({ email_verified: undefined })],
    ['email_verified as a string', token({ email_verified: 'true' })],
    ['no email', token({ email: undefined })],
    ['email not a string', token({ email: 42 })],
    ['gmail', token({ email: 'alice@gmail.com' })],
    ['lookalike suffix', token({ email: 'alice@hcmut.edu.vn.evil.com' })],
    ['lookalike prefix', token({ email: 'alice@evilhcmut.edu.vn' })],
    ['subdomain', token({ email: 'alice@mail.hcmut.edu.vn' })],
    ['empty local part', token({ email: '@hcmut.edu.vn' })],
    ['two @', token({ email: 'a@b@hcmut.edu.vn' })],
    ['anonymous provider', token({ firebase: { sign_in_provider: 'anonymous' } })],
  ])('throws permission-denied (Vietnamese) for %s', (_label, tok) => {
    const err = thrown(() => requireVerifiedMember(req('alice', tok)));
    expect(err.code).toBe('permission-denied');
    expect(err.message).toBe(MSG_NOT_VERIFIED);
  });
});
