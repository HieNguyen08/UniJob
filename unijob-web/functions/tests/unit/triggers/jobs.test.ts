import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/jobs.js', () => ({ handleJobUpdated: vi.fn(async () => 0) }));

import { handleJobUpdated } from '../../../src/handlers/jobs.js';
import { onJobUpdated } from '../../../src/triggers/jobs.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('onJobUpdated', () => {
  it('is bound to jobs/{jobId} updates on the named database in asia-southeast1', () => {
    expect(onJobUpdated.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobUpdated.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.updated',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobs/{jobId}' },
    });
  });
  it('passes db, id, before and after', async () => {
    await onJobUpdated.run({
      params: { jobId: 'j1' },
      data: { before: snap({ status: 'open' }), after: snap({ status: 'cancelled' }) },
    } as never);
    expect(handleJobUpdated).toHaveBeenCalledWith({ fake: 'db' }, 'j1', { status: 'open' }, { status: 'cancelled' });
  });
});
