import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/confirmCompletion.js', () => ({ handleConfirmCompletion: vi.fn(async () => ({ status: 'pending', workerConfirmed: true, posterConfirmed: false })) }));

import { confirmCompletion } from '../../../src/callables/confirmCompletion.js';
import { handleConfirmCompletion } from '../../../src/handlers/confirmCompletion.js';

const verified = { email: 'alice@hcmut.edu.vn', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const request = (uid?: string, token: unknown = verified) =>
  ({ data: { jobId: 'j1' }, auth: uid ? { uid, token, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => confirmCompletion.run(req));

beforeEach(() => vi.clearAllMocks());

describe('confirmCompletion', () => {
  it('is a callable in asia-southeast1', () => {
    expect(confirmCompletion.__endpoint.region).toEqual(['asia-southeast1']);
    expect(confirmCompletion.__endpoint.callableTrigger).toBeDefined();
  });
  it('passes the Admin db, the verified uid and the data', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ status: 'pending', workerConfirmed: true, posterConfirmed: false });
    expect(handleConfirmCompletion).toHaveBeenCalledWith({ fake: 'db' }, 'alice', { jobId: 'j1' });
  });
  it.each([
    ['signed out', request(), 'unauthenticated'],
    ['unverified email', request('alice', { ...verified, email_verified: false }), 'permission-denied'],
    ['non-HCMUT email', request('alice', { ...verified, email: 'alice@gmail.com' }), 'permission-denied'],
    ['anonymous user', request('alice', { firebase: { sign_in_provider: 'anonymous' } }), 'permission-denied'],
  ])('rejects %s before touching data', async (_l, req, code) => {
    await expect(call(req)).rejects.toMatchObject({ code });
    expect(handleConfirmCompletion).not.toHaveBeenCalled();
  });
});
