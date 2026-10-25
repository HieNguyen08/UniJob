import { describe, expect, it } from 'vitest';
import { callableErrorMessage } from '@/lib/callableError';

const opts = {
  codeMessages: {
    'invalid-argument': 'A', 'not-found': 'B', 'permission-denied': 'C', 'failed-precondition': 'D', unauthenticated: 'E',
  },
  serverMessages: new Set(['Thông điệp server.']),
  fallback: 'F',
};

describe('callableErrorMessage', () => {
  it('passes a known server message through for a user-facing code', () => {
    expect(callableErrorMessage({ code: 'functions/not-found', message: 'Thông điệp server.' }, opts)).toBe('Thông điệp server.');
  });
  it('uses the local text for a user-facing code with an unknown message', () => {
    expect(callableErrorMessage({ code: 'functions/not-found', message: 'not-found' }, opts)).toBe('B');
    expect(callableErrorMessage({ code: 'functions/unauthenticated', message: '' }, opts)).toBe('E');
  });
  it.each([
    { code: 'functions/internal', message: 'Thông điệp server.' },
    { code: 'functions/constructor', message: 'x' },
    { code: 'permission-denied', message: 'Thông điệp server.' },
    new Error('network'),
    null,
    undefined,
    'boom',
  ])('falls back for %j', (err) => {
    expect(callableErrorMessage(err, opts)).toBe('F');
  });
});
