export type UserFacingCode =
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'failed-precondition'
  | 'unauthenticated';

interface CallableErrorOptions {
  /** Local Vietnamese text per user-facing code (used when the message is not a known server string). */
  codeMessages: Readonly<Record<UserFacingCode, string>>;
  /** Exact server messages that may be shown verbatim. */
  serverMessages: ReadonlySet<string>;
  fallback: string;
}

/**
 * Toast text for a failed callable: the server's message when it is one of the known server strings,
 * otherwise the local Vietnamese text for the code, otherwise the generic fallback. The SDK builds
 * FunctionsError from bare HTTP statuses with message == the code name, which must never reach the toast.
 */
export function callableErrorMessage(err: unknown, opts: CallableErrorOptions): string {
  if (typeof err !== 'object' || err === null) return opts.fallback;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !code.startsWith('functions/')) return opts.fallback;
  const short = code.slice('functions/'.length);
  if (!Object.hasOwn(opts.codeMessages, short)) return opts.fallback;
  if (typeof message === 'string' && opts.serverMessages.has(message)) return message;
  return opts.codeMessages[short as UserFacingCode];
}
