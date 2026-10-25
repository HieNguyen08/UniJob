import { logger } from 'firebase-functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/payments.js', () => ({ handleEscrow: vi.fn(async () => 'skipped') }));

import { handleEscrow } from '../../../src/handlers/payments.js';
import { onJobEscrow } from '../../../src/triggers/escrow.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });
const event = (time: string) => ({
  params: { jobId: 'j1' },
  time,
  data: { before: snap({ status: 'open' }), after: snap({ status: 'in-progress' }) },
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('onJobEscrow', () => {
  it('is a retried jobs/{jobId} update trigger on the named database in asia-southeast1', () => {
    expect(onJobEscrow.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobEscrow.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.updated',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobs/{jobId}' },
      retry: true,
    });
  });
  it('passes db, id, before and after to the escrow handler', async () => {
    await onJobEscrow.run(event(new Date().toISOString()) as never);
    expect(handleEscrow).toHaveBeenCalledWith({ fake: 'db' }, 'j1', { status: 'open' }, { status: 'in-progress' });
  });
  it('lets a handler failure propagate so Cloud Functions retries', async () => {
    vi.mocked(handleEscrow).mockRejectedValueOnce(new Error('firestore down'));
    await expect(onJobEscrow.run(event(new Date().toISOString()) as never)).rejects.toThrow('firestore down');
  });
  it('drops events older than 24 hours with an error log and no handler call', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(onJobEscrow.run(event(new Date(Date.now() - 25 * 3600_000).toISOString()) as never)).resolves.toBeUndefined();
    expect(handleEscrow).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('onJobEscrow: event too old, dropped', expect.objectContaining({ jobId: 'j1' }));
  });
});
