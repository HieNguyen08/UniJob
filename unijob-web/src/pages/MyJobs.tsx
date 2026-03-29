import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
  title: string;
  subtitle: string;
  paymentLabel: string;
  status: WorkStatus;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  notificationCount?: number;
};

const receivedJobs: ReceivedJob[] = [
  {
    id: 'r1',
    title: 'Thiết kế Slide Powerpoint thuyết trình',
    postedBy: 'Trần Thị B',
    deadlineLabel: 'Hạn chót: 20/02/2026',
    paymentLabel: '150.000đ',
    status: 'in-progress',
    actionLabel: 'Báo cáo hoàn thành',
    dangerActionLabel: 'Hủy việc',
  },
  {
    id: 'r2',
    title: 'Dịch thuật tài liệu tiếng Nhật N3',
    postedBy: 'Nguyễn Văn C',
    deadlineLabel: 'Đã nộp: Hôm qua',
    paymentLabel: '300.000đ',
    status: 'pending',
    actionLabel: 'Xem lại minh chứng',
  },
  {
    id: 'r3',
    title: 'Seeding bài viết Facebook',
    postedBy: 'Lê Thị D',
    deadlineLabel: 'Hoàn thành: 10/02/2026',
    paymentLabel: '50.000đ',
    status: 'completed',
    actionLabel: 'Đánh giá người đăng',
  },
];

const postedJobs: PostedJob[] = [
  {
    id: 'p1',
    title: 'Tìm người quay video TikTok sự kiện',
    subtitle: 'Đăng cách đây 2 giờ',
    paymentLabel: '500.000đ',
    status: 'finding',
    primaryActionLabel: 'Xem 3 ứng viên',
    secondaryActionLabel: 'Chỉnh sửa tin',
    notificationCount: 3,
  },
  {
    id: 'p2',
    title: 'Dịch thuật tài liệu tiếng Nhật N3',
    subtitle: 'Người làm: Nguyễn Văn A',
    paymentLabel: '300.000đ',
    status: 'pending',
    primaryActionLabel: 'Kiểm tra & Thanh toán',
  },
  {
    id: 'p3',
    title: 'Code Landing Page ReactJS',
    subtitle: 'Người làm: Lê Văn C',
    paymentLabel: '800.000đ',
    status: 'in-progress',
    primaryActionLabel: 'Nhắn tin',
    secondaryActionLabel: 'Hủy công việc',
  },
];

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

function ReportModal({ onClose }: { onClose: () => void }) {
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
            <h3 className="myjobs-info-title">Thiết kế Slide Powerpoint thuyết trình</h3>
            <p className="myjobs-muted">Người đăng: Trần Thị B</p>
            <p className="myjobs-price-green">150.000đ</p>
            <p className="myjobs-muted">Hạn chót: 20/02/2026</p>
          </section>

          <section>
            <label className="myjobs-label">Lời nhắn / Mô tả kết quả</label>
            <textarea
              rows={4}
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
          <button className="myjobs-btn myjobs-btn-primary" type="button">
            Gửi báo cáo & Hoàn tất
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
  step,
  onClose,
  onNext,
}: {
  step: 1 | 2;
  onClose: () => void;
  onNext: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState('');

  const reasons = [
    'Không thể hoàn thành đúng deadline',
    'Yêu cầu công việc thay đổi quá nhiều',
    'Lý do cá nhân khẩn cấp',
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
            <p className="myjobs-info-title">Thiết kế Slide Powerpoint thuyết trình</p>
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
            onClick={onNext}
            type="button"
            disabled={step === 1 ? !selectedReason : false}
            className={`myjobs-btn myjobs-btn-danger ${
              step === 1 && !selectedReason
                ? 'myjobs-btn-danger-disabled'
                : ''
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
  const [activeTab, setActiveTab] = useState<WorkTab>('received');
  const [showReportModal, setShowReportModal] = useState(false);
  const [cancelStep, setCancelStep] = useState<0 | 1 | 2>(0);

  const stats = useMemo(
    () => [
      {
        value: '2',
        label: 'Đang thực hiện',
        icon: <Loader className="h-6 w-6 text-blue-500" />,
        accent: 'myjobs-accent-blue',
      },
      {
        value: '1',
        label: 'Chờ xác nhận',
        icon: <Clock3 className="h-6 w-6 text-orange-500" />,
        accent: 'myjobs-accent-orange',
      },
      {
        value: '15',
        label: 'Đã hoàn thành',
        icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
        accent: 'myjobs-accent-green',
      },
    ],
    []
  );

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
              <span>Giới hạn nhận việc: 2/3 job đang chạy</span>
              <div className="myjobs-progress-track">
                <div className="myjobs-progress-bar" />
              </div>
            </div>
          ) : (
            <button className="myjobs-btn myjobs-btn-primary myjobs-post-btn" type="button">
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
                          if (job.id === 'r1') {
                            setShowReportModal(true);
                            return;
                          }
                        }}
                        type="button"
                        className={`myjobs-action-link ${
                          job.id === 'r1'
                            ? 'myjobs-action-outline'
                            : ''
                        }`}
                      >
                        {job.actionLabel}
                      </button>
                    )}
                    {job.dangerActionLabel && (
                      <button
                        onClick={() => setCancelStep(1)}
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
                          if (job.id === 'p1') {
                            navigate('/my-jobs/candidates');
                            return;
                          }
                          if (job.id === 'p2') {
                            navigate('/my-jobs/acceptance');
                            return;
                          }
                        }}
                        type="button"
                        className={`myjobs-btn myjobs-item-primary ${
                          job.id === 'p2'
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

      {showReportModal ? <ReportModal onClose={() => setShowReportModal(false)} /> : null}
      {cancelStep === 1 ? (
        <CancelModal
          step={1}
          onClose={() => setCancelStep(0)}
          onNext={() => setCancelStep(2)}
        />
      ) : null}
      {cancelStep === 2 ? (
        <CancelModal
          step={2}
          onClose={() => setCancelStep(0)}
          onNext={() => setCancelStep(0)}
        />
      ) : null}
    </div>
  );
}
