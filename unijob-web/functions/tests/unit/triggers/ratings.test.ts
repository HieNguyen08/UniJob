import { logger } from 'firebase-functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/ratings.js', () => ({ handleRatingCreated: vi.fn(async () => 'skipped') }));

import { handleRatingCreated } from '../../../src/handlers/ratings.js';
import { onRatingCreated } from '../../../src/triggers/ratings.js';

const snap = (data: Record<string, unknown>) => ({ data: () => data });
const event = (time: string) => ({
  params: { ratingId: 'r1' },
  time,
  data: snap({ toUserId: 'u1', fromUserId: 'u2', score: 5 }),
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('onRatingCreated', () => {
  it('is a retried ratings/{ratingId} create trigger on the named database in asia-southeast1', () => {
    expect(onRatingCreated.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onRatingCreated.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.created',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'ratings/{ratingId}' },
      retry: true,
    });
  });
  it('passes db, rating id and data to the rating handler', async () => {
    await onRatingCreated.run(event(new Date().toISOString()) as never);
    expect(handleRatingCreated).toHaveBeenCalledWith({ fake: 'db' }, 'r1', { toUserId: 'u1', fromUserId: 'u2', score: 5 });
  });
  it('lets a handler failure propagate so Cloud Functions retries', async () => {
    vi.mocked(handleRatingCreated).mockRejectedValueOnce(new Error('firestore down'));
    await expect(onRatingCreated.run(event(new Date().toISOString()) as never)).rejects.toThrow('firestore down');
  });
  it('drops events older than 24 hours with an error log and no handler call', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(onRatingCreated.run(event(new Date(Date.now() - 25 * 3600_000).toISOString()) as never)).resolves.toBeUndefined();
    expect(handleRatingCreated).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('onRatingCreated: event too old, dropped', expect.objectContaining({ ratingId: 'r1' }));
  });
});
