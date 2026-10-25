import { describe, expect, it } from 'vitest';
import * as functions from '../../src/index.js';

type Endpoint = { region?: string[]; eventTrigger?: { eventFilters?: Record<string, string> } };

describe('functions entry point', () => {
  it('exports exactly the deployable functions', () => {
    expect(Object.keys(functions).sort()).toEqual(
      ['confirmCompletion', 'disputePayment', 'expireJobs', 'onApplicationCreated', 'onApplicationUpdated', 'onJobCompletionWritten', 'onJobEscrow', 'onJobUpdated', 'ping', 'sendJobInvite'].sort(),
    );
  });

  it('every function is in asia-southeast1 and every Firestore trigger targets kirigitejkf8095h', () => {
    for (const [name, fn] of Object.entries(functions)) {
      const endpoint = (fn as { __endpoint: Endpoint }).__endpoint;
      expect(endpoint.region, name).toEqual(['asia-southeast1']);
      if (endpoint.eventTrigger) expect(endpoint.eventTrigger.eventFilters?.database, name).toBe('kirigitejkf8095h');
    }
  });
});
