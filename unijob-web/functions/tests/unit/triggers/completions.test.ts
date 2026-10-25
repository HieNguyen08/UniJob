import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/admin.js', () => ({ db: { fake: 'db' } }));
vi.mock('../../../src/handlers/completions.js', () => ({ handleCompletionWritten: vi.fn(async () => false) }));

import { handleCompletionWritten } from '../../../src/handlers/completions.js';
import { onJobCompletionWritten } from '../../../src/triggers/completions.js';

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('onJobCompletionWritten', () => {
  it('is bound to jobCompletions/{completionId} writes on the named database in asia-southeast1', () => {
    expect(onJobCompletionWritten.__endpoint.region).toEqual(['asia-southeast1']);
    expect(onJobCompletionWritten.__endpoint.eventTrigger).toMatchObject({
      eventType: 'google.cloud.firestore.document.v1.written',
      eventFilters: { database: 'kirigitejkf8095h' },
      eventFilterPathPatterns: { document: 'jobCompletions/{completionId}' },
    });
  });
  it('passes before (undefined on create) and after', async () => {
    await onJobCompletionWritten.run({
      params: { completionId: 'c1' },
      data: { before: snap(undefined), after: snap({ workerConfirmed: true }) },
    } as never);
    expect(handleCompletionWritten).toHaveBeenCalledWith({ fake: 'db' }, 'c1', undefined, { workerConfirmed: true });
  });
});
