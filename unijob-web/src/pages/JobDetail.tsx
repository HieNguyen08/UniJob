import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobById, applyForJob } from '@/services/job.service';
import { getUserById } from '@/services/user.service';
import { toggleBookmark, getBookmarkedJobIds } from '@/services/bookmark.service';
import type { Job, User } from '@/types';
import { JOB_CATEGORIES } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft,
  Zap,
  Clock,
  Users,
  Star,
  Calendar,
  Send,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, userProfile } = useAuthStore();
  const [job, setJob] = useState<Job | null>(null);
  const [poster, setPoster] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyMessage, setApplyMessage] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    if (id) {
      getJobById(id).then((data) => {
        setJob(data);
        setLoading(false);
        if (data?.postedBy) {
          getUserById(data.postedBy).then(setPoster);
        }
      });
    }
  }, [id]);

  useEffect(() => {
    if (!userProfile?.uid || !id) return;
    getBookmarkedJobIds(userProfile.uid).then((ids) => {
      setIsBookmarked(ids.includes(id));
    });
  }, [userProfile?.uid, id]);

  const handleBookmark = async () => {
    if (!isAuthenticated || !userProfile) { toast.error('Vui lòng đăng nhập'); return; }
    setBookmarkLoading(true);
    try {
      const newState = await toggleBookmark(userProfile.uid, id!);
      setIsBookmarked(newState);
      toast.success(newState ? 'Đã lưu công việc!' : 'Đã bỏ lưu');
    } catch {
      toast.error('Không thể lưu, thử lại');
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Đã sao chép link!');
  };

  const hasApplied = userProfile?.uid ? job?.applicants?.includes(userProfile.uid) : false;

  const handleApply = async () => {
    if (!isAuthenticated || !userProfile) { navigate('/login'); return; }
    if (hasApplied) { toast.error('Bạn đã ứng tuyển công việc này rồi!'); return; }
    setApplying(true);
    try {
      await applyForJob(id!, userProfile.uid, userProfile.displayName, userProfile.photoURL || '', applyMessage);
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
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left column ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Header card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
            <div className="mb-3 flex flex-wrap items-start gap-2">
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

            <h1 className="mb-1 text-2xl font-bold">{job.title}</h1>
            {!job.isAnonymous && (
              <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
                Đăng bởi <span className="font-medium text-[var(--color-foreground)]">{job.postedByName}</span>
              </p>
            )}

            {/* Meta row */}
            <div className="mb-5 flex flex-wrap gap-4 text-sm text-[var(--color-muted-foreground)]">
              {categoryInfo && (
                <span>{categoryInfo.icon} {categoryInfo.label}</span>
              )}
              {job.faculty && (
                <span>📍 {job.faculty}</span>
              )}
              {job.duration && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {job.duration}</span>
              )}
            </div>

            {/* Description */}
            <h2 className="mb-2 text-base font-semibold">Mô tả công việc</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              {job.description}
            </p>
          </div>

          {/* Skills / Requirements */}
          {job.tags && job.tags.length > 0 && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-3 text-base font-semibold">Tiêu chí ứng tuyển</h2>
              <ul className="space-y-2">
                {job.tags.map((tag) => (
                  <li key={tag} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <span>{tag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Poster info */}
          {!job.isAnonymous && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-3 text-base font-semibold">Người đăng</h2>
              <div className="flex items-center gap-3">
                {(poster?.photoURL || job.postedByPhoto) ? (
                  <img
                    src={poster?.photoURL || job.postedByPhoto}
                    alt={job.postedByName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg font-bold text-white">
                    {job.postedByName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold">{job.postedByName}</p>
                  {poster?.faculty && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">{poster.faculty}</p>
                  )}
                  {poster?.ratingScore != null && poster.ratingScore > 0 && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-yellow-500">
                      <Star className="h-3 w-3 fill-yellow-400" />
                      <span className="font-medium">{poster.ratingScore.toFixed(1)}</span>
                      {poster.totalRatings > 0 && (
                        <span className="text-[var(--color-muted-foreground)]">({poster.totalRatings} đánh giá)</span>
                      )}
                    </div>
                  )}
                </div>
                {isAuthenticated && userProfile?.uid !== job.postedBy && (
                  <Link
                    to="/profile"
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-secondary)]"
                  >
                    Xem hồ sơ
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">
          {/* Salary + Apply card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            {/* Salary hero */}
            <div className="mb-4 border-b border-[var(--color-border)] pb-4">
              <p className="mb-0.5 text-xs text-[var(--color-muted-foreground)]">Mức thù lao</p>
              <p className="text-2xl font-bold text-[var(--color-primary)]">
                {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
              </p>
            </div>

            {/* Apply */}
            {!isOwner && job.status === 'open' && (
              <div className="mb-4">
                {hasApplied ? (
                  <p className="rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-600">
                    ✓ Đã ứng tuyển
                  </p>
                ) : showApplyForm ? (
                  <div className="space-y-2">
                    <textarea
                      value={applyMessage}
                      onChange={(e) => setApplyMessage(e.target.value)}
                      placeholder="Viết lời nhắn cho người đăng..."
                      className="w-full rounded-xl border border-[var(--color-border)] p-3 text-sm outline-none focus:border-[var(--color-primary)]"
                      rows={3}
                    />
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {applying ? 'Đang gửi...' : 'Gửi ứng tuyển'}
                    </button>
                    <button
                      onClick={() => setShowApplyForm(false)}
                      className="w-full rounded-xl border border-[var(--color-border)] py-2 text-sm hover:bg-[var(--color-secondary)]"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => (isAuthenticated ? setShowApplyForm(true) : navigate('/login'))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 font-medium text-white hover:opacity-90"
                  >
                    <Send className="h-5 w-5" />
                    Ứng tuyển ngay
                  </button>
                )}
              </div>
            )}

            {/* Save + Share */}
            <div className="flex gap-2">
              <button
                onClick={handleBookmark}
                disabled={bookmarkLoading}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm transition-colors ${
                  isBookmarked
                    ? 'border-[var(--color-primary)] bg-green-50 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]'
                }`}
              >
                {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {isBookmarked ? 'Đã lưu' : 'Lưu'}
              </button>
              <button
                onClick={handleShare}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] py-2 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]"
              >
                <Share2 className="h-4 w-4" />
                Chia sẻ
              </button>
            </div>
          </div>

          {/* Details card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold">Chi tiết</h3>
            <div className="space-y-3 text-sm">
              {job.deadline && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 shrink-0 text-red-400" />
                  <div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">Hạn nộp hồ sơ</p>
                    <p className="font-medium">
                      {format(job.deadline.toDate(), 'dd/MM/yyyy', { locale: vi })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 shrink-0 text-indigo-400" />
                <div>
                  <p className="text-xs text-[var(--color-muted-foreground)]">Số lượng ứng tuyển</p>
                  <p className="font-medium">
                    {job.applicants?.length || 0} / {job.maxApplicants || '∞'} người
                  </p>
                </div>
              </div>
              {job.duration && (
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 shrink-0 text-purple-400" />
                  <div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">Thời gian</p>
                    <p className="font-medium">{job.duration}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
