import { useMemo, useState } from 'react';
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
    className: 'bg-blue-100 text-blue-600',
  },
  pending: {
    label: 'Chờ xác nhận',
    className: 'bg-orange-100 text-orange-600',
  },
  completed: {
    label: 'Đã hoàn thành',
    className: 'bg-green-100 text-green-600',
  },
  finding: {
    label: 'Đang tìm người',
    className: 'bg-slate-100 text-slate-600',
  },
};

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-3 ${accent}`}>{icon}</div>
        <div>
          <p className="text-4xl font-bold leading-none text-slate-800">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </article>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <h2 className="text-4xl font-bold text-slate-900">Báo cáo hoàn thành công việc</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <section className="rounded-xl bg-slate-50 p-4">
            <h3 className="text-2xl font-semibold text-slate-800">Thiết kế Slide Powerpoint thuyết trình</h3>
            <p className="mt-1 text-base text-slate-500">Người đăng: Trần Thị B</p>
            <p className="mt-1 font-semibold text-green-600">150.000đ</p>
            <p className="text-base text-slate-500">Hạn chót: 20/02/2026</p>
          </section>

          <section>
            <label className="mb-2 block text-lg font-medium text-slate-700">Lời nhắn / Mô tả kết quả</label>
            <textarea
              rows={4}
              placeholder="VD: Em đã hoàn thành slide, link file gốc ở bên dưới..."
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none focus:border-green-500"
            />
          </section>

          <section>
            <p className="mb-2 text-lg font-medium text-slate-700">Minh chứng kết quả</p>
            <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-lg font-medium text-slate-600">Kéo thả file hoặc nhấn để tải lên</p>
              <p className="mt-1 text-sm text-slate-400">(Ảnh, PDF, Zip)</p>
            </div>
          </section>
        </div>

        <div className="border-t border-[var(--color-border)] px-6 py-5">
          <button className="w-full rounded-xl bg-green-500 py-3 text-lg font-semibold text-white hover:bg-green-600">
            Gửi báo cáo & Hoàn tất
          </button>
          <button onClick={onClose} className="mt-3 w-full py-2 text-lg font-medium text-slate-500 hover:text-slate-700">
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
  const reasons = [
    'Chọn lý do hủy...',
    'Không thể hoàn thành đúng deadline',
    'Yêu cầu công việc thay đổi quá nhiều',
    'Lý do cá nhân khẩn cấp',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-[var(--color-border)] px-8 py-6">
          <h2 className="text-4xl font-bold text-slate-900">Xác nhận hủy công việc</h2>
          <p className="mt-2 text-lg text-slate-600">Vui lòng cho biết lý do bạn muốn hủy công việc này.</p>
        </div>

        <div className="space-y-5 px-8 py-6">
          <section className="rounded-xl bg-slate-50 p-4">
            <p className="text-lg text-slate-600">Công việc:</p>
            <p className="text-3xl font-semibold text-slate-800">Thiết kế Slide Powerpoint thuyết trình</p>
          </section>

          <section>
            <label className="mb-2 block text-xl font-semibold text-slate-800">Lý do hủy bỏ:</label>
            <select className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-lg outline-none focus:border-red-400">
              {reasons.map((reason) => (
                <option key={reason}>{step === 1 && reason !== reasons[0] ? reasons[0] : reason}</option>
              ))}
            </select>
          </section>

          <section className="rounded-xl border border-red-300 bg-red-50 p-5">
            <div className="mb-2 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-3xl font-bold">Cảnh báo vi phạm chính sách:</h3>
            </div>
            <ul className="list-disc space-y-1 pl-6 text-xl text-red-700">
              <li>Hủy sát giờ (dưới 12 tiếng): -20 điểm uy tín.</li>
              <li>Tài khoản sẽ bị giới hạn đăng bài trong 3 ngày.</li>
            </ul>
          </section>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[var(--color-border)] px-8 py-5">
          <button onClick={onClose} className="rounded-xl bg-green-500 py-3 text-2xl font-semibold text-white hover:bg-green-600">
            Quay lại (Không hủy)
          </button>
          <button
            onClick={onNext}
            className={`rounded-xl border py-3 text-2xl font-semibold ${
              step === 1
                ? 'border-red-200 text-red-300'
                : 'border-red-500 bg-red-50 text-red-500 hover:bg-red-100'
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
        accent: 'bg-blue-50',
      },
      {
        value: '1',
        label: 'Chờ xác nhận',
        icon: <Clock3 className="h-6 w-6 text-orange-500" />,
        accent: 'bg-orange-50',
      },
      {
        value: '15',
        label: 'Đã hoàn thành',
        icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
        accent: 'bg-green-50',
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-2xl font-bold text-red-700">
        hello world from my-jobs
      </div>
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-5xl font-bold text-slate-900">Quản lý công việc</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('received')}
              className={`border-b-2 pb-2 text-xl font-semibold ${
                activeTab === 'received'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-slate-400'
              }`}
            >
              Việc tôi nhận
            </button>
            <button
              onClick={() => setActiveTab('posted')}
              className={`border-b-2 pb-2 text-xl font-semibold ${
                activeTab === 'posted'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-slate-400'
              }`}
            >
              Việc tôi đăng
            </button>
          </div>

          {activeTab === 'received' ? (
            <div className="flex items-center gap-2 text-base text-slate-500">
              <span>Giới hạn nhận việc: 2/3 job đang chạy</span>
              <div className="h-3 w-32 rounded-full bg-slate-200">
                <div className="h-3 w-2/3 rounded-full bg-green-500" />
              </div>
            </div>
          ) : (
            <button className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-base font-semibold text-white hover:bg-green-600">
              <Plus className="h-4 w-4" />
              Đăng công việc mới
            </button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          {activeTab === 'received'
            ? receivedJobs.map((job) => (
                <article key={job.id} className="rounded-2xl border border-[var(--color-border)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-3xl font-bold text-slate-800">{job.title}</h3>
                      <p className="mt-1 text-lg text-slate-500">Người đăng: {job.postedBy}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-lg text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        {job.deadlineLabel}
                      </span>
                      <span className="font-semibold text-slate-700">{job.paymentLabel}</span>
                      <span className={`rounded-full px-4 py-1 font-semibold ${statusConfig[job.status].className}`}>
                        {statusConfig[job.status].label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
                    {job.actionLabel && (
                      <button
                        onClick={() => {
                          if (job.id === 'r1') {
                            setShowReportModal(true);
                            return;
                          }
                        }}
                        className={`rounded-xl px-5 py-2 text-lg font-semibold ${
                          job.id === 'r1'
                            ? 'border border-green-500 text-green-500 hover:bg-green-50'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                      >
                        {job.actionLabel}
                      </button>
                    )}
                    {job.dangerActionLabel && (
                      <button
                        onClick={() => setCancelStep(1)}
                        className="text-lg font-semibold text-red-500 hover:text-red-600"
                      >
                        {job.dangerActionLabel}
                      </button>
                    )}
                  </div>
                </article>
              ))
            : postedJobs.map((job) => (
                <article key={job.id} className="rounded-2xl border border-[var(--color-border)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-bold text-slate-800">{job.title}</h3>
                      <p className="mt-1 text-lg text-slate-500">{job.subtitle}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <span className="text-2xl font-semibold text-slate-700">{job.paymentLabel}</span>
                      <span className={`rounded-full px-4 py-1 text-lg font-semibold ${statusConfig[job.status].className}`}>
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
                        className={`relative rounded-xl px-5 py-2 text-lg font-semibold ${
                          job.id === 'p2'
                            ? 'border border-orange-500 text-orange-500 hover:bg-orange-50'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {job.primaryActionLabel}
                        {job.notificationCount ? (
                          <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                            {job.notificationCount}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>

                  {job.secondaryActionLabel ? (
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => {
                          if (job.secondaryActionLabel === 'Hủy công việc') {
                            setCancelStep(1);
                          }
                        }}
                        className={`text-lg font-semibold ${
                          job.secondaryActionLabel === 'Hủy công việc'
                            ? 'text-red-500 hover:text-red-600'
                            : 'text-green-500 hover:text-green-600'
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
