import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Job, Payment } from '@/types';

// Ký quỹ do Cloud Functions ghi (rules cấm client ghi payments). Client chỉ đọc; tranh chấp qua dispute.service.
const paymentsCollection = collection(db, 'payments');

function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 'permission-denied';
}

const createdSeconds = (p: Payment) => (p.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;

/**
 * Lấy thanh toán của một công việc: đọc trực tiếp payments/{jobId}_{payeeId} (do server tạo),
 * nếu không có/không được phép thì tìm bản ghi cũ (id ngẫu nhiên) theo payer rồi payee.
 */
export async function getPaymentForJob(
  job: Pick<Job, 'id' | 'assignedTo'>,
  uid: string
): Promise<Payment | null> {
  if (!uid) return null;
  const payee = job.assignedTo?.[0];
  if (payee) {
    try {
      const snap = await getDoc(doc(db, 'payments', `${job.id}_${payee}`));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Payment;
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  for (const field of ['payerId', 'payeeId'] as const) {
    try {
      const snapshot = await getDocs(
        query(paymentsCollection, where('jobId', '==', job.id), where(field, '==', uid))
      );
      if (!snapshot.empty) {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Payment);
        return items.reduce((best, p) => (createdSeconds(p) > createdSeconds(best) ? p : best));
      }
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  return null;
}

/**
 * Lấy thông tin thanh toán theo paymentId.
 */
export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const paymentRef = doc(db, 'payments', paymentId);
  const snap = await getDoc(paymentRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Payment;
}

/**
 * Lấy tất cả giao dịch của một user (với tư cách payer hoặc payee).
 */
export async function getPaymentsByUser(userId: string): Promise<Payment[]> {
  const [asPayerSnap, asPayeeSnap] = await Promise.all([
    getDocs(query(paymentsCollection, where('payerId', '==', userId))),
    getDocs(query(paymentsCollection, where('payeeId', '==', userId))),
  ]);

  const seen = new Set<string>();
  const results: Payment[] = [];

  for (const docSnap of [...asPayerSnap.docs, ...asPayeeSnap.docs]) {
    if (!seen.has(docSnap.id)) {
      seen.add(docSnap.id);
      results.push({ id: docSnap.id, ...docSnap.data() } as Payment);
    }
  }

  return results.sort((a, b) => {
    const aTime = (a.createdAt as { seconds?: number })?.seconds ?? 0;
    const bTime = (b.createdAt as { seconds?: number })?.seconds ?? 0;
    return bTime - aTime;
  });
}
