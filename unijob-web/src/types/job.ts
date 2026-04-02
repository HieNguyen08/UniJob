import type { Timestamp } from 'firebase/firestore';

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
  deadline: Timestamp;
  maxApplicants: number;
  status: JobStatus;
  postedBy: string;
  postedByName: string;
  postedByPhoto: string;
  assignedTo: string[];
  applicants: string[];
  tags: string[];
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
