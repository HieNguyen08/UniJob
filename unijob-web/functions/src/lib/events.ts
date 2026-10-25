/** Retried triggers drop events older than this, so a permanent failure does not retry forever. */
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

/** True when the CloudEvent `time` is more than 24 hours before `now`. A missing or invalid time is not too old. */
export function eventTooOld(time: string | undefined, now: number = Date.now()): boolean {
  const at = time ? Date.parse(time) : Number.NaN;
  return Number.isFinite(at) && now - at > MAX_EVENT_AGE_MS;
}
