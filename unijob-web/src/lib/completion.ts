/** Marker the confirmCompletion callable writes (functions COMPLETION_VERSION). Docs without it are not trusted. */
export const COMPLETION_VERSION = 'completion-v1';

/** True for a record written by the server completion flow (source 'server' and the current version marker). */
export function isServerRecord(data: { source?: unknown; serverVersion?: unknown } | undefined): boolean {
  return data?.source === 'server' && data.serverVersion === COMPLETION_VERSION;
}
