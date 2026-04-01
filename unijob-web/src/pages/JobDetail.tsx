import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobById, applyForJob } from '@/services/job.service';
import type { Job } from '@/types';
import { JOB_CATEGORIES } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft,
  Zap,
  MapPin,
  Clock,
  DollarSign,
  Users,
  Star,
  Calendar,
  Send,
  EyeOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, userProfile } = useAuthStore();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyMessage, setApplyMessage] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (id) {
      getJobById(id).then((data) => {
        setJob(data);
        setLoading(false);
      });
    }
  }, [id]);

  const hasApplied = userProfile?.uid ? job?.applicants?.includes(userProfile.uid) : false;

  const handleApply = async () => {
    if (!isAuthenticated || !userProfile) {
      navigate('/login');
      return;
    }
    if (hasApplied) {
      toast.error('Bạn đã ứng tuyển công việc này rồi!');
      return;
    }
    setApplying(true);
    try {
      await applyForJob(
        id!,
        userProfile.uid,
        userProfile.displayName,
        userProfile.photoURL || '',
        applyMessage
      );
      setJob((prev) =>
        prev ? { ...prev, applicants: [...(prev.applicants || []), userProfile.uid] } : prev
      );
      toast.success('Đã ứng tuyển thành công!');
      setShowApplyForm(false);
      setApplyMessage('');
    } catch (error) {
      console.error('Apply error:', error);
      toast.error('Lỗi khi ứng tuyển, vui lòng thử lại');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="h-64 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-bold">Không tìm thấy công việc</h2>
        <Link to="/jobs" className="mt-4 inline-block text-[var(--color-primary)] hover:underline">
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const categoryInfo = JOB_CATEGORIES.find((c) => c.value === job.category);
  const isOwner = userProfile?.uid === job.postedBy;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
            {/* Header */}
            <div className="mb-4 flex flex-wrap items-start gap-2">
              {job.isUrgent && (
                <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                  <Zap className="h-3 w-3" /> Khẩn cấp
                </span>
              )}
              {job.isAnonymous && (
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  <EyeOff className="h-3 w-3" /> Ẩn danh
                </span>
              )}
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium capitalize text-green-700">
                {job.status}
              </span>
            </div>

            <h1 className="mb-2 text-2xl font-bold">{job.title}</h1>

            {!job.isAnonymous && (
              <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
                Đăng bởi <span className="font-medium text-[var(--color-foreground)]">{job.postedByName}</span>
              </p>
            )}

            {/* Description */}
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold">Mô tả công việc</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {job.description}
              </p>
            </div>

            {/* Tags */}
            {job.tags && job.tags.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-sm font-semibold">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {job.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Apply Section */}
          {!isOwner && job.status === 'open' && (
            <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Ứng tuyển</h2>
              {hasApplied ? (
                <p className="text-sm text-green-600 font-medium">Bạn đã ứng tuyển công việc này.</p>
              ) : showApplyForm ? (
                <div>
                  <textarea
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    placeholder="Viết lời nhắn cho người đăng..."
                    className="mb-4 w-full rounded-xl border border-[var(--color-border)] p-3 text-sm outline-none focus:border-[var(--color-primary)]"
                    rows={4}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {applying ? 'Đang gửi...' : 'Gửi ứng tuyển'}
                    </button>
                    <button
                      onClick={() => setShowApplyForm(false)}
                      disabled={applying}
                      className="rounded-xl border border-[var(--color-border)] px-6 py-2.5 text-sm hover:bg-[var(--color-secondary)]"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => (isAuthenticated ? setShowApplyForm(true) : navigate('/login'))}
                  className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 font-medium text-white transition-transform hover:scale-105"
                >
                  <Send className="h-5 w-5" />
                  Ứng tuyển ngay
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Info card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="mb-4 font-semibold">Chi tiết</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <DollarSign className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-[var(--color-muted-foreground)]">Mức trả</p>
                  <p className="font-medium">
                    {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
                  </p>
                </div>
              </div>
              {categoryInfo && (
                <div className="flex items-center gap-3 text-sm">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <div>
                    <p className="text-[var(--color-muted-foreground)]">Danh mục</p>
                    <p className="font-medium">
                      {categoryInfo.icon} {categoryInfo.label}
                    </p>
                  </div>
                </div>
              )}
              {job.faculty && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-[var(--color-muted-foreground)]">Khoa</p>
                    <p className="font-medium">{job.faculty}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-[var(--color-muted-foreground)]">Thời gian</p>
                  <p className="font-medium">{job.duration || 'Linh hoạt'}</p>
                </div>
              </div>
              {job.deadline && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-[var(--color-muted-foreground)]">Deadline</p>
                    <p className="font-medium">
                      {format(job.deadline.toDate(), 'dd/MM/yyyy', { locale: vi })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Users className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-[var(--color-muted-foreground)]">Ứng viên</p>
                  <p className="font-medium">
                    {job.applicants?.length || 0} / {job.maxApplicants || '∞'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
