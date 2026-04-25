import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Payment, PaymentMethod } from '@/types';
import { updateJob } from '@/services/job.service';

const paymentsCollection = collection(db, 'payments');

/**
 * Tính phí nền tảng theo bậc:
 * - Volunteer / 0đ: 0%
 * - < 200,000đ:     3%
 * - 200,000–1,000,000đ: 5%
 * - > 1,000,000đ:   4%
 */
export function calculatePlatformFee(amount: number): number {
  if (amount <= 0) return 0;
  if (amount < 200_000) return Math.round(amount * 0.03);
  if (amount <= 1_000_000) return Math.round(amount * 0.05);
  return Math.round(amount * 0.04);
}

/**
 * Tạo bản ghi thanh toán ký quỹ (escrow) khi poster chấp nhận ứng viên.
 * Trạng thái ban đầu: 'held' — tiền đang được giữ bởi nền tảng.
 */
export async function createPayment(
  jobId: string,
  jobTitle: string,
  payerId: string,
  payeeId: string,
  amount: number,
  method: PaymentMethod = 'platform_escrow',
  note?: string
): Promise<string> {
  const platformFee = calculatePlatformFee(amount);
  const netAmount = amount - platformFee;

  const docRef = await addDoc(paymentsCollection, {
    jobId,
    jobTitle,
    payerId,
    payeeId,
    amount,
    platformFee,
    netAmount,
    status: amount > 0 ? 'held' : 'released', // volunteer job không cần giữ
    method,
    note: note ?? '',
    createdAt: serverTimestamp(),
    heldAt: amount > 0 ? serverTimestamp() : null,
    releasedAt: amount > 0 ? null : serverTimestamp(),
  });

  // Cập nhật paymentStatus trên job document
  await updateJob(jobId, { paymentStatus: amount > 0 ? 'held' : 'released' });

  return docRef.id;
}

/**
 * Giải phóng tiền cho worker sau khi cả hai bên xác nhận hoàn thành.
 */
export async function releasePayment(paymentId: string): Promise<void> {
  const paymentRef = doc(db, 'payments', paymentId);
  await updateDoc(paymentRef, {
    status: 'released',
    releasedAt: serverTimestamp(),
  });

  // Cập nhật paymentStatus trên job
  const snap = await getDoc(paymentRef);
  if (snap.exists()) {
    const data = snap.data();
    await updateJob(data.jobId, { paymentStatus: 'released' });
  }
}

/**
 * Hoàn tiền cho poster (khi huỷ job hoặc tranh chấp).
 */
export async function refundPayment(paymentId: string): Promise<void> {
  const paymentRef = doc(db, 'payments', paymentId);
  await updateDoc(paymentRef, {
    status: 'refunded',
    refundedAt: serverTimestamp(),
  });

  const snap = await getDoc(paymentRef);
  if (snap.exists()) {
    const data = snap.data();
    await updateJob(data.jobId, { paymentStatus: 'refunded' });
  }
}

/**
 * Đánh dấu thanh toán đang tranh chấp.
 */
export async function disputePayment(paymentId: string): Promise<void> {
  const paymentRef = doc(db, 'payments', paymentId);
  await updateDoc(paymentRef, { status: 'disputed' });

  const snap = await getDoc(paymentRef);
  if (snap.exists()) {
    const data = snap.data();
    await updateJob(data.jobId, { paymentStatus: 'disputed' });
  }
}

/**
 * Lấy thông tin thanh toán theo jobId.
 */
export async function getPaymentByJob(jobId: string): Promise<Payment | null> {
  const q = query(paymentsCollection, where('jobId', '==', jobId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as Payment;
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
