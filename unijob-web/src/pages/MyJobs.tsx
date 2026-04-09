import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import {
  getApplicationsByUser,
  getJobsByUser,
  getJobById,
  getApplicationsByJob,
} from '@/services/job.service';
import { getJobCompletion, createJobCompletion, confirmCompletion } from '@/services/rating.service';
import { workerCancelJob, posterCancelJob } from '@/services/cancel.service';

import toast from 'react-hot-toast';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Loader,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import './my-jobs.css';

type WorkTab = 'received' | 'posted';
type WorkStatus = 'in-progress' | 'pending' | 'completed' | 'finding';

type ReceivedJob = {
  id: string;
  applicationId: string;
  rawDeadline: { toDate: () => Date } | null;
  title: string;
  postedBy: string;
  deadlineLabel: string;
  paymentLabel: string;
  status: WorkStatus;
  actionLabel?: string;
  dangerActionLabel?: string;
};

type PostedJob = {
  id: string;
  hasAssignedWorker: boolean;
  title: string;
  subtitle: string;
  paymentLabel: string;
  status: WorkStatus;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  notificationCount?: number;
};

const statusConfig: Record<WorkStatus, { label: string; className: string }> = {
  'in-progress': {
    label: 'Đang thực hiện',
    className: 'myjobs-badge-in-progress',
  },
  pending: {
    label: 'Chờ xác nhận',
    className: 'myjobs-badge-pending',
  },
  completed: {
    label: 'Đã hoàn thành',
    className: 'myjobs-badge-completed',
  },
  finding: {
    label: 'Đang tìm người',
    className: 'myjobs-badge-finding',
  },
};

function StatCard({ icon, value, label, accent }: { icon: ReactNode; value: string; label: string; accent: string }) {
  return (
    <article className="myjobs-stat-card">
      <div className="myjobs-stat-content">
        <div className={`myjobs-stat-icon ${accent}`}>{icon}</div>
        <div>
          <p className="myjobs-stat-value">{value}</p>
          <p className="myjobs-stat-label">{label}</p>
        </div>
      </div>
    </article>
  );
}

function ReportModal({ job, onClose, onSubmitted }: {
  job: ReceivedJob;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const completion = await getJobCompletion(job.id);
      let completionId: string;
      if (completion) {
        completionId = completion.id;
      } else {
        completionId = await createJobCompletion(job.id);
      }
      await confirmCompletion(completionId, 'worker');
      toast.success('Đã gửi báo cáo hoàn thành! Chờ người đăng xác nhận.');
      onSubmitted();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="myjobs-modal-backdrop">
      <div className="myjobs-modal myjobs-modal-report">
        <div className="myjobs-modal-header">
          <h2 className="myjobs-modal-title">Báo cáo hoàn thành công việc</h2>
          <button onClick={onClose} className="myjobs-icon-btn" type="button" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="myjobs-modal-body">
          <section className="myjobs-info-card">
            <h3 className="myjobs-info-title">{job.title}</h3>
            <p className="myjobs-muted">Người đăng: {job.postedBy}</p>
            <p className="myjobs-price-green">{job.paymentLabel}</p>
            <p className="myjobs-muted">{job.deadlineLabel}</p>
          </section>

          <section>
            <label className="myjobs-label">Lời nhắn / Mô tả kết quả</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="VD: Em đã hoàn thành slide, link file gốc ở bên dưới..."
              className="myjobs-textarea"
            />
          </section>

          <section>
            <p className="myjobs-label">Minh chứng kết quả</p>
            <div className="myjobs-upload-zone">
              <div className="myjobs-upload-icon-wrap">
                <Upload className="h-6 w-6" />
              </div>
              <p className="myjobs-upload-title">Kéo thả file hoặc nhấn để tải lên</p>
              <p className="myjobs-upload-subtitle">(Ảnh, PDF, Zip)</p>
            </div>
          </section>
        </div>

        <div className="myjobs-modal-footer">
          <button
            className="myjobs-btn myjobs-btn-primary"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Đang gửi...' : 'Gửi báo cáo & Hoàn tất'}
          </button>
          <button onClick={onClose} className="myjobs-btn-link" type="button">
            Hủy bỏ
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({
  jobTitle,
  onClose,
  onNext,
}: {
  jobTitle: string;
  onClose: () => void;
  onNext: (reason: string) => void;
}) {
  const [selectedReason, setSelectedReason] = useState('');

  const reasons = [
    'Không thể hoàn thành đúng deadline',
    'Yêu cầu công việc thay đổi quá nhiều',
    'Lý do cá nhân khẩn cấp',
    'Khác'
  ];

  return (
    <div className="myjobs-modal-backdrop">
      <div className="myjobs-modal myjobs-modal-cancel">
        <div className="myjobs-modal-header">
          <div>
            <h2 className="myjobs-modal-title">Xác nhận hủy công việc</h2>
            <p className="myjobs-modal-subtitle">Vui lòng cho biết lý do bạn muốn hủy công việc này.</p>
          </div>
          <button onClick={onClose} className="myjobs-icon-btn" type="button" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="myjobs-modal-body">
          <section className="myjobs-info-card">
            <p className="myjobs-muted">Công việc:</p>
            <p className="myjobs-info-title">{jobTitle}</p>
          </section>

          <section>
            <label className="myjobs-label">Lý do hủy bỏ:</label>
            <select
              className="myjobs-select"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
            >
              <option value="">Chọn lý do hủy...</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </section>

          <section className="myjobs-alert">
            <div className="myjobs-alert-title-wrap">
              <AlertCircle className="h-6 w-6" />
              <h3 className="myjobs-alert-title">Cảnh báo vi phạm chính sách:</h3>
            </div>
            <ul className="myjobs-alert-list">
              <li>Hủy sát giờ (dưới 12 tiếng): -20 điểm uy tín.</li>
              <li>Tài khoản sẽ bị giới hạn đăng bài trong 3 ngày.</li>
            </ul>
          </section>
        </div>

        <div className="myjobs-cancel-actions">
          <button onClick={onClose} className="myjobs-btn myjobs-btn-primary" type="button">
            Quay lại (Không hủy)
          </button>
          <button
            onClick={() => onNext(selectedReason)}
            type="button"
            disabled={!selectedReason}
            className={`myjobs-btn myjobs-btn-danger ${
              !selectedReason ? 'myjobs-btn-danger-disabled' : ''
            }`}
          >
            Xác nhận Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyJobs() {
  const navigate = useNavigate();
  const { userProfile } = useAuthStore();
  const [receivedJobs, setReceivedJobs] = useState<ReceivedJob[]>([]);
  const [postedJobs, setPostedJobs] = useState<PostedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkTab>('received');
  const [reportJobTarget, setReportJobTarget] = useState<ReceivedJob | null>(null);
  const [cancelStep, setCancelStep] = useState<0 | 1>(0);
  const [cancelJobTarget, setCancelJobTarget] = useState<{ type: 'worker' | 'poster', job: ReceivedJob | PostedJob } | null>(null);

  const loadJobs = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      // --- Việc tôi nhận (applications) ---
      const applications = await getApplicationsByUser(userProfile!.uid);
      const receivedList = await Promise.all(
        applications
          .filter((app) => app.status === 'accepted')
          .map(async (app) => {
            const job = await getJobById(app.jobId);
            if (!job) return null;

            const completion = await getJobCompletion(job.id);
            let status: WorkStatus = 'in-progress';
            if (job.status === 'completed') status = 'completed';
            else if (completion && completion.workerConfirmed && !completion.posterConfirmed)
              status = 'pending';

            const deadline = job.deadline?.toDate
              ? job.deadline.toDate().toLocaleDateString('vi-VN')
              : 'N/A';

            return {
              id: job.id,
              applicationId: app.id,
              rawDeadline: job.deadline,
              title: job.title,
              postedBy: job.isAnonymous ? 'Ẩn danh' : job.postedByName,
              deadlineLabel: `Hạn chót: ${deadline}`,
              paymentLabel: job.payment > 0
                ? new Intl.NumberFormat('vi-VN').format(job.payment) + 'đ'
                : 'Tình nguyện',
              status,
              actionLabel: status === 'in-progress' ? 'Báo cáo hoàn thành'
                : status === 'pending' ? 'Xem lại minh chứng'
                : status === 'completed' ? 'Đánh giá người đăng'
                : undefined,
              dangerActionLabel: status === 'in-progress' ? 'Hủy việc' : undefined,
            } as ReceivedJob;
          })
      );
      setReceivedJobs(receivedList.filter(Boolean) as ReceivedJob[]);

      // --- Việc tôi đăng ---
      const myPostedJobs = await getJobsByUser(userProfile!.uid);
      const postedList: PostedJob[] = await Promise.all(
        myPostedJobs.map(async (job) => {
          // Đếm ứng viên chờ duyệt
          const apps = await getApplicationsByJob(job.id);
          const pendingApps = apps.filter((a) => a.status === 'pending');

          let status: WorkStatus = 'finding';
          if (job.status === 'in-progress') status = 'in-progress';
          else if (job.status === 'completed') status = 'completed';
          else if (job.assignedTo?.length > 0) status = 'pending';

          const assignedName = job.assignedTo?.[0]
            ? apps.find((a) => a.applicantId === job.assignedTo[0])?.applicantName || 'Sinh viên'
            : null;

          return {
            id: job.id,
            hasAssignedWorker: (job.assignedTo?.length ?? 0) > 0,
            title: job.title,
            subtitle: assignedName
              ? `Người làm: ${assignedName}`
              : `Đăng cách đây vài ngày`,
            paymentLabel: job.payment > 0
              ? new Intl.NumberFormat('vi-VN').format(job.payment) + 'đ'
              : 'Tình nguyện',
            status,
            primaryActionLabel: status === 'finding'
              ? `Xem ${pendingApps.length} ứng viên`
              : status === 'pending' ? 'Kiểm tra & Thanh toán'
              : 'Nhắn tin',
            secondaryActionLabel: status !== 'completed' ? 'Hủy công việc' : undefined,
            notificationCount: pendingApps.length > 0 ? pendingApps.length : undefined,
          } as PostedJob;
        })
      );
      setPostedJobs(postedList);
    } catch (err) {
      console.error(err);
      toast.error('Không tải được danh sách công việc');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [userProfile]);

  const stats = useMemo(() => {
    const inProgress = receivedJobs.filter((j) => j.status === 'in-progress').length;
    const pending = receivedJobs.filter((j) => j.status === 'pending').length;
    const completed = receivedJobs.filter((j) => j.status === 'completed').length;
    return [
      { value: String(inProgress), label: 'Đang thực hiện', icon: <Loader className="h-6 w-6 text-blue-500" />, accent: 'myjobs-accent-blue' },
      { value: String(pending), label: 'Chờ xác nhận', icon: <Clock3 className="h-6 w-6 text-orange-500" />, accent: 'myjobs-accent-orange' },
      { value: String(completed), label: 'Đã hoàn thành', icon: <CheckCircle2 className="h-6 w-6 text-green-500" />, accent: 'myjobs-accent-green' },
    ];
  }, [receivedJobs]);

  if (loading) {
    return (
      <div className="myjobs-page">
        <div className="myjobs-container">
          <div className="flex justify-center py-20">
            <Loader className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="myjobs-page">
      <div className="myjobs-container">
        <h1 className="myjobs-title">Quản lý công việc</h1>

        <div className="myjobs-stats-grid">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              icon={stat.icon}
              value={stat.value}
              label={stat.label}
              accent={stat.accent}
            />
          ))}
        </div>

        <div className="myjobs-tabs-row">
          <div className="myjobs-tabs-left">
            <button
              onClick={() => setActiveTab('received')}
              type="button"
              className={`myjobs-tab-btn ${
                activeTab === 'received'
                  ? 'myjobs-tab-btn-active'
                  : 'myjobs-tab-btn-inactive'
              }`}
            >
              Việc tôi nhận
            </button>
            <button
              onClick={() => setActiveTab('posted')}
              type="button"
              className={`myjobs-tab-btn ${
                activeTab === 'posted'
                  ? 'myjobs-tab-btn-active'
                  : 'myjobs-tab-btn-inactive'
              }`}
            >
              Việc tôi đăng
            </button>
          </div>

          {activeTab === 'received' ? (
            <div className="myjobs-limit-wrap">
              <span>
                Giới hạn nhận việc: {userProfile?.activeJobCount ?? 0}/{userProfile?.maxJobLimit ?? 2} job đang chạy
              </span>
              <div className="myjobs-progress-track">
                <div
                  className="myjobs-progress-bar"
                  style={{ width: `${Math.min(100, ((userProfile?.activeJobCount ?? 0) / (userProfile?.maxJobLimit ?? 2)) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate('/create-job')}
              className="myjobs-btn myjobs-btn-primary myjobs-post-btn"
              type="button"
            >
              <Plus className="h-4 w-4" />
              Đăng công việc mới
            </button>
          )}
        </div>

        <div className="myjobs-list">
          {activeTab === 'received'
            ? receivedJobs.map((job) => (
                <article key={job.id} className="myjobs-item-card">
                  <div className="myjobs-item-main">
                    <div>
                      <h3 className="myjobs-item-title">{job.title}</h3>
                      <p className="myjobs-item-sub">Người đăng: {job.postedBy}</p>
                    </div>

                    <div className="myjobs-item-meta">
                      <span className="myjobs-inline-meta">
                        <Calendar className="h-5 w-5" />
                        {job.deadlineLabel}
                      </span>
                      <span className="myjobs-item-price">{job.paymentLabel}</span>
                      <span className={`myjobs-badge ${statusConfig[job.status].className}`}>
                        {statusConfig[job.status].label}
                      </span>
                    </div>
                  </div>

                  <div className="myjobs-item-actions">
                    {job.actionLabel && (
                      <button
                        onClick={() => {
                          if (job.status === 'in-progress') {
                            setReportJobTarget(job);
                            return;
                          }
                        }}
                        type="button"
                        className={`myjobs-action-link ${
                          job.status === 'in-progress'
                            ? 'myjobs-action-outline'
                            : ''
                        }`}
                      >
                        {job.actionLabel}
                      </button>
                    )}
                    {job.dangerActionLabel && (
                      <button
                        onClick={() => {
                          setCancelJobTarget({ type: 'worker', job });
                          setCancelStep(1);
                        }}
                        className="myjobs-action-danger"
                        type="button"
                      >
                        {job.dangerActionLabel}
                      </button>
                    )}
                  </div>
                </article>
              ))
            : postedJobs.map((job) => (
                <article key={job.id} className="myjobs-item-card">
                  <div className="myjobs-item-main">
                    <div>
                      <h3 className="myjobs-item-title">{job.title}</h3>
                      <p className="myjobs-item-sub">{job.subtitle}</p>
                    </div>

                    <div className="myjobs-item-meta">
                      <span className="myjobs-item-price">{job.paymentLabel}</span>
                      <span className={`myjobs-badge ${statusConfig[job.status].className}`}>
                        {statusConfig[job.status].label}
                      </span>
                      <button
                        onClick={() => {
                          if (job.status === 'finding') {
                            navigate(`/my-jobs/candidates?jobId=${job.id}`);
                          } else if (job.status === 'pending') {
                            navigate(`/my-jobs/acceptance?jobId=${job.id}`);
                          }
                        }}
                        type="button"
                        className={`myjobs-btn myjobs-item-primary ${
                          job.status === 'pending'
                            ? 'myjobs-btn-warning'
                            : 'myjobs-btn-primary'
                        }`}
                      >
                        {job.primaryActionLabel}
                        {job.notificationCount ? (
                          <span className="myjobs-noti-dot">
                            {job.notificationCount}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>

                  {job.secondaryActionLabel ? (
                    <div className="myjobs-item-actions align-right">
                      <button
                        onClick={() => {
                          if (job.secondaryActionLabel === 'Hủy công việc') {
                            setCancelJobTarget({ type: 'poster', job });
                            setCancelStep(1);
                          }
                        }}
                        type="button"
                        className={`myjobs-action-link ${
                          job.secondaryActionLabel === 'Hủy công việc'
                            ? 'myjobs-action-danger'
                            : ''
                        }`}
                      >
                        {job.secondaryActionLabel}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
        </div>
      </div>

      {reportJobTarget && (
        <ReportModal
          job={reportJobTarget}
          onClose={() => setReportJobTarget(null)}
          onSubmitted={loadJobs}
        />
      )}
      
      {cancelStep === 1 && cancelJobTarget ? (
        <CancelModal
          jobTitle={cancelJobTarget.job.title}
          onClose={() => {
            setCancelStep(0);
            setCancelJobTarget(null);
          }}
          onNext={async (reason) => {
            try {
              if (cancelJobTarget.type === 'worker') {
                const wJob = cancelJobTarget.job as ReceivedJob;
                const result = await workerCancelJob(
                  wJob.id,
                  wJob.applicationId,
                  userProfile!.uid,
                  reason as any,
                  wJob.rawDeadline
                );
                toast.success(result.message);
              } else {
                const pJob = cancelJobTarget.job as PostedJob;
                const result = await posterCancelJob(
                  pJob.id,
                  userProfile!.uid,
                  pJob.hasAssignedWorker
                );
                toast.success(result.message);
              }
              setCancelStep(0);
              setCancelJobTarget(null);
              // Tải lại jobs sau khi hủy
              loadJobs();
            } catch (error) {
              console.error(error);
              toast.error('Có lỗi xảy ra khi hủy công việc.');
            }
          }}
        />
      ) : null}
    </div>
  );
}
