import { logger } from 'firebase-functions';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { isDocId } from '../lib/jobs.js';
import { profileStub } from '../lib/profileStub.js';
import { aggregateRatings, currentCount, reputationScore } from '../lib/reputation.js';

/**
 * Recomputes ratingAverage / totalRatings / ratingScore of the rated user from all of their ratings
 * (plan 2026-10-25-server-reputation, Decision 1). Recompute, not increment: safe under redelivery, and the
 * transaction reads the user doc so two concurrent triggers serialise. A missing profile gets a server stub
 * (set with merge), so a missing doc cannot launder reputation.
 */
export async function handleRatingCreated(
  db: Firestore,
  ratingId: string,
  rating: DocumentData | undefined,
): Promise<'updated' | 'skipped'> {
  const toUserId = rating?.toUserId;
  if (!isDocId(toUserId)) {
    logger.warn('onRatingCreated: rating without a usable toUserId, skipped', { ratingId });
    return 'skipped';
  }
  const userRef = db.collection('users').doc(toUserId);
  return db.runTransaction(async (tx) => {
    const [ratings, user] = await Promise.all([
      tx.get(db.collection('ratings').where('toUserId', '==', toUserId)),
      tx.get(userRef),
    ]);
    const { ratingAverage, totalRatings } = aggregateRatings(toUserId, ratings.docs.map((d) => ({ id: d.id, data: d.data() })));
    const fields = {
      ratingAverage,
      totalRatings,
      ratingScore: reputationScore(ratingAverage, currentCount(user.get('penaltyPoints'))),
    };
    if (user.exists) {
      tx.update(userRef, fields);
    } else {
      logger.warn('onRatingCreated: rated user has no profile, writing a server stub', { ratingId, userId: toUserId });
      tx.set(userRef, profileStub(toUserId, fields), { merge: true });
    }
    return 'updated' as const;
  });
}
