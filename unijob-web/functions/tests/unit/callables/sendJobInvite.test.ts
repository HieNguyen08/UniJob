import type { CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' }, authNameOf: { fake: 'authNameOf' } }));
vi.mock('../../../src/handlers/invites.js', () => ({ handleSendJobInvite: vi.fn(async () => ({ sent: true })) }));

import { sendJobInvite } from '../../../src/callables/sendJobInvite.js';
import { handleSendJobInvite } from '../../../src/handlers/invites.js';

const request = (uid?: string, data: unknown = { jobId: 'j1', workerId: 'bob' }) =>
  ({ data, auth: uid ? { uid, token: {}, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => sendJobInvite.run(req));

describe('sendJobInvite', () => {
  it('is a callable in asia-southeast1', () => {
    expect(sendJobInvite.__endpoint.region).toEqual(['asia-southeast1']);
    expect(sendJobInvite.__endpoint.callableTrigger).toBeDefined();
  });
  it('passes the Admin db, the caller uid, the data and the Auth name lookup', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ sent: true });
    expect(handleSendJobInvite).toHaveBeenCalledWith({ fake: 'db' }, 'alice', { jobId: 'j1', workerId: 'bob' }, { fake: 'authNameOf' });
  });
  it('rejects signed-out callers before touching data', async () => {
    vi.mocked(handleSendJobInvite).mockClear();
    await expect(call(request())).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(handleSendJobInvite).not.toHaveBeenCalled();
  });
});
