import { logger } from 'firebase-functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/counters.js', () => ({ handleJobCounters: vi.fn(async () => 'skipped') }));

import { handleJobCounters } from '../../../src/handlers/counters.js';
import { onJobCounters } from '../../../src/triggers/counters.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });
const event = (time: string) => ({
  params: { jobId: 'j1' },
  time,
  data: { before: snap({ status: 'open' }), after: snap({ status: 'in-progress' }) },
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('onJobCounters', () => {
  it('is a retried jobs/{jobId} update trigger on the named database in asia-southeast1', () => {
    expect(onJobCounters.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobCounters.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.updated',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobs/{jobId}' },
      retry: true,
    });
  });
  it('passes db, id, before and after to the counters handler', async () => {
    await onJobCounters.run(event(new Date().toISOString()) as never);
    expect(handleJobCounters).toHaveBeenCalledWith({ fake: 'db' }, 'j1', { status: 'open' }, { status: 'in-progress' });
  });
  it('lets a handler failure propagate so Cloud Functions retries', async () => {
    vi.mocked(handleJobCounters).mockRejectedValueOnce(new Error('firestore down'));
    await expect(onJobCounters.run(event(new Date().toISOString()) as never)).rejects.toThrow('firestore down');
  });
  it('drops events older than 24 hours with an error log and no handler call', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(onJobCounters.run(event(new Date(Date.now() - 25 * 3600_000).toISOString()) as never)).resolves.toBeUndefined();
    expect(handleJobCounters).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('onJobCounters: event too old, dropped', expect.objectContaining({ jobId: 'j1' }));
  });
});
