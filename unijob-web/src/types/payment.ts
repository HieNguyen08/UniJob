import type { Timestamp } from 'firebase/firestore';

export type PaymentStatus = 'pending' | 'held' | 'released' | 'refunded' | 'disputed';
export type PaymentMethod = 'cash' | 'transfer' | 'platform_escrow';

export interface Payment {
  id: string;
  jobId: string;
  jobTitle: string;
  payerId: string;      // poster (người đăng việc)
  payeeId: string;      // worker (người thực hiện)
  amount: number;       // VND - tổng số tiền
  platformFee: number;  // phí nền tảng
  netAmount: number;    // amount - platformFee (người nhận thực nhận)
  status: PaymentStatus;
  method: PaymentMethod;
  note?: string;
  createdAt: Timestamp;
  heldAt?: Timestamp;
  releasedAt?: Timestamp;
  refundedAt?: Timestamp;
}
