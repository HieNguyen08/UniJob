import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Notification } from '@/types/notification';

// Thông báo do Cloud Functions tạo (rules cấm client tạo). Client chỉ đọc và đánh dấu đã đọc.
const notificationsCollection = collection(db, 'notifications');

export function subscribeToNotifications(
  userId: string,
  onUpdate: (notifications: Notification[]) => void
): () => void {
  const q = query(
    notificationsCollection,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Notification[];
    onUpdate(notifications);
  }, (error) => {
    // Silently handle permission errors (e.g. index not ready, auth not loaded)
    console.warn('[notifications] Listener error:', error.code);
  });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const ref = doc(db, 'notifications', notificationId);
  await updateDoc(ref, { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(
    notificationsCollection,
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
