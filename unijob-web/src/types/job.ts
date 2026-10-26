import type { Timestamp } from 'firebase/firestore';
import type { PaymentStatus } from './payment';

export type JobStatus = 'open' | 'in-progress' | 'completed' | 'cancelled';
export type PaymentType = 'fixed' | 'hourly' | 'negotiable' | 'volunteer';
export type JobLocation = 'online' | 'offline' | 'onsite';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  faculty: string;
  location?: JobLocation;
  isUrgent: boolean;
  isAnonymous: boolean;
  payment: number;
  paymentType: PaymentType;
  duration: string;
  deadline: Timestamp | null; // null = không có hạn chót
  maxApplicants: number;
  status: JobStatus;
  postedBy: string;
  postedByName: string;
  postedByPhoto: string;
  assignedTo: string[];
  applicants: string[];
  tags: string[];
  attachments?: string[];   // Firebase Storage download URLs
  paymentStatus?: PaymentStatus; // trạng thái thanh toán ký quỹ
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type JobCreateInput = Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'applicants' | 'assignedTo' | 'status'>;

export interface JobFilter {
  category?: string;
  faculty?: string;
  isUrgent?: boolean;
  paymentType?: PaymentType;
  status?: JobStatus;
  searchQuery?: string;
  sortBy?: string;
}

export interface Application {
  id: string;
  jobId: string;
  applicantId: string;
  applicantName: string;
  applicantPhoto: string;
  message: string;
  status: ApplicationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CancelReason =
  | 'Không thể hoàn thành đúng deadline'
  | 'Yêu cầu công việc thay đổi quá nhiều'
  | 'Lý do cá nhân khẩn cấp'
  | 'Khác';

/** Result of the cancelJob callable; penaltyPoints is computed by the server. */
export interface CancelJobResult {
  penaltyPoints: number;
  status: 'cancelled' | 'open';
}
