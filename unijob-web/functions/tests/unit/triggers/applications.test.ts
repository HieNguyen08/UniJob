import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' }, authNameOf: { fake: 'authNameOf' } }));
vi.mock('../../../src/handlers/applications.js', () => ({
  handleApplicationCreated: vi.fn(async () => true),
  handleApplicationUpdated: vi.fn(async () => true),
}));

import { handleApplicationCreated, handleApplicationUpdated } from '../../../src/handlers/applications.js';
import { onApplicationCreated, onApplicationUpdated } from '../../../src/triggers/applications.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('application triggers', () => {
  it('are bound to applications/{appId} on the named database in asia-southeast1', () => {
    for (const fn of [onApplicationCreated, onApplicationUpdated]) {
      expect(fn.__endpoint.region).toEqual(['asia-southeast1']);
      expect(fn.__endpoint.eventTrigger).toMatchObject({
        eventFilters: { database: 'kirigitejkf8095h' },
        eventFilterPathPatterns: { document: 'applications/{appId}' },
      });
    }
    expect(onApplicationCreated.__endpoint.eventTrigger?.eventType).toBe('google.cloud.firestore.document.v1.created');
    expect(onApplicationUpdated.__endpoint.eventTrigger?.eventType).toBe('google.cloud.firestore.document.v1.updated');
  });

  it('onApplicationCreated passes db, the id and the data to the handler', async () => {
    await onApplicationCreated.run({ params: { appId: 'j1_carol' }, data: snap({ jobId: 'j1' }) } as never);
    expect(handleApplicationCreated).toHaveBeenCalledWith({ fake: 'db' }, 'j1_carol', { jobId: 'j1' }, { fake: 'authNameOf' });
  });

  it('onApplicationUpdated passes before and after', async () => {
    await onApplicationUpdated.run({
      params: { appId: 'j1_carol' },
      data: { before: snap({ status: 'pending' }), after: snap({ status: 'accepted' }) },
    } as never);
    expect(handleApplicationUpdated).toHaveBeenCalledWith({ fake: 'db' }, 'j1_carol', { status: 'pending' }, { status: 'accepted' });
  });

  it('tolerates an event without data', async () => {
    await onApplicationCreated.run({ params: { appId: 'x' }, data: undefined } as never);
    expect(handleApplicationCreated).toHaveBeenCalledWith({ fake: 'db' }, 'x', undefined, { fake: 'authNameOf' });
  });
});
