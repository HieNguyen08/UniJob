
import { getUserById, updateUserProfile } from '@/services/user.service';
import { getJobById, updateJob, updateApplicationStatus } from '@/services/job.service';
import { createNotification } from '@/services/notification.service';

export type CancelReason =
  | 'Không thể hoàn thành đúng deadline'
  | 'Yêu cầu công việc thay đổi quá nhiều'
  | 'Lý do cá nhân khẩn cấp'
  | 'Khác';

export interface CancelResult {
  penaltyPoints: number;
  message: string;
}

/**
 * Worker cancels an accepted job.
 * Penalty: -20 điểm uy tín nếu hủy sát deadline (< 24h)
 */
export async function workerCancelJob(
  jobId: string,
  applicationId: string,
  workerId: string,
  _reason: CancelReason,
  deadlineTimestamp: { toDate: () => Date } | null
): Promise<CancelResult> {
  let penaltyPoints = 0;

  // Tính penalty dựa trên thời gian còn lại
  if (deadlineTimestamp?.toDate) {
    const hoursLeft = (deadlineTimestamp.toDate().getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < 12) penaltyPoints = 20;
    else if (hoursLeft < 24) penaltyPoints = 10;
    else penaltyPoints = 5;
  } else {
    penaltyPoints = 5;
  }

  // Trừ điểm uy tín
  const user = await getUserById(workerId);
  if (user) {
    const newScore = Math.max(0, (user.ratingScore ?? 0) - penaltyPoints * 0.1);
    const newActiveCount = Math.max(0, (user.activeJobCount ?? 1) - 1);
    await updateUserProfile(workerId, {
      ratingScore: Math.round(newScore * 10) / 10,
      activeJobCount: newActiveCount,
    });
  }

  // Đổi application về rejected
  await updateApplicationStatus(applicationId, 'rejected');

  // Đổi job về open để tìm người khác
  const job = await getJobById(jobId);
  await updateJob(jobId, { status: 'open' });

  // Notify poster that worker cancelled
  try {
    if (job?.postedBy) {
      await createNotification(
        job.postedBy,
        'job_cancelled',
        `Người nhận việc đã hủy "${job.title}". Công việc đang tìm người mới.`,
        { jobId, jobTitle: job.title }
      );
    }
  } catch { /* non-critical */ }

  return {
    penaltyPoints,
    message:
      penaltyPoints >= 20
        ? `Hủy sát giờ — bạn bị trừ ${penaltyPoints} điểm uy tín.`
        : `Đã hủy — bạn bị trừ ${penaltyPoints} điểm uy tín.`,
  };
}

/**
 * Poster cancels a job they posted.
 * Penalty: -5 điểm uy tín nếu job đã có người nhận
 */
export async function posterCancelJob(
  jobId: string,
  posterId: string,
  hasAssignedWorker: boolean
): Promise<CancelResult> {
  const penaltyPoints = hasAssignedWorker ? 5 : 0;

  if (penaltyPoints > 0) {
    const user = await getUserById(posterId);
    if (user) {
      const newScore = Math.max(0, (user.ratingScore ?? 0) - penaltyPoints * 0.1);
      await updateUserProfile(posterId, {
        ratingScore: Math.round(newScore * 10) / 10,
      });
    }
  }

  const cancelledJob = await getJobById(jobId);
  await updateJob(jobId, { status: 'cancelled' });

  // Notify assigned worker if any
  try {
    if (cancelledJob?.assignedTo?.length) {
      for (const workerId of cancelledJob.assignedTo) {
        await createNotification(
          workerId,
          'job_cancelled',
          `Công việc "${cancelledJob.title}" đã bị người đăng hủy.`,
          { jobId, jobTitle: cancelledJob.title }
        );
      }
    }
  } catch { /* non-critical */ }

  return {
    penaltyPoints,
    message: penaltyPoints > 0
      ? `Đã hủy việc — bạn bị trừ ${penaltyPoints} điểm uy tín vì đã có người nhận việc.`
      : 'Đã hủy việc thành công.',
  };
}
