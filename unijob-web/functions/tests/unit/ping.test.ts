import type { CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { ping } from '../../src/index.js';

const request = (uid?: string) =>
  ({ data: {}, auth: uid ? { uid, token: {}, rawToken: '' } : undefined, rawRequest: {}, acceptsStreaming: false }) as unknown as CallableRequest<unknown>;
const call = (req: CallableRequest<unknown>) => Promise.resolve().then(() => ping.run(req));

describe('ping', () => {
  it('returns ok, the caller uid and the region when signed in', async () => {
    await expect(call(request('alice'))).resolves.toEqual({ ok: true, uid: 'alice', region: 'asia-southeast1' });
  });

  it('rejects signed-out callers with unauthenticated', async () => {
    await expect(call(request())).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('is declared in asia-southeast1', () => {
    expect(ping.__endpoint.region).toEqual(['asia-southeast1']);
  });
});
