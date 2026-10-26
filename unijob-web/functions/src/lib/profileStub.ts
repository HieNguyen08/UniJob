/**
 * Server-owned fields for a users/{uid} doc that does not exist yet. A server write must not skip a missing
 * profile (that would launder a penalty or a counter); it writes this stub with set(..., { merge: true }).
 * `stub: true` marks it as server-created: it has no email or name, and the web sign-in completes a stub once
 * (instead of skipping creation). Only ever written when the doc does not exist, so a real profile never gets it.
 */
export function profileStub(uid: string, fields: Record<string, number> = {}): Record<string, unknown> {
  return {
    uid,
    stub: true,
    ratingAverage: 0,
    totalRatings: 0,
    ratingScore: 0,
    penaltyPoints: 0,
    activeJobCount: 0,
    completedJobs: 0,
    ...fields,
  };
}
