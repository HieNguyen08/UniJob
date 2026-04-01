import { useAuthStore } from '@/store/authStore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateUserProfile } from '@/services/user.service';
import { getJobsByUser } from '@/services/job.service';
import { getRatingsByUser } from '@/services/rating.service';
import { FACULTIES } from '@/lib/constants';
import type { Job, Rating } from '@/types';
import {
  Star,
  Mail,
  Phone,
  BookOpen,
  Award,
  Save,
  Edit3,
  FileDown,
  BadgeCheck,
  Calendar,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

type ActivityTab = 'all' | 'completed' | 'reviews';

function formatDate(timestamp: unknown): string {
  if (!timestamp || typeof timestamp !== 'object') return 'N/A';

  const maybeTimestamp = timestamp as { toDate?: () => Date };
  if (!maybeTimestamp.toDate) return 'N/A';

  return maybeTimestamp.toDate().toLocaleDateString('vi-VN');
}

export default function Profile() {
  const navigate = useNavigate();
  const { userProfile, refreshProfile } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [myRatings, setMyRatings] = useState<Rating[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [form, setForm] = useState({
    displayName: userProfile?.displayName || '',
    faculty: userProfile?.faculty || '',
    department: userProfile?.department || '',
    studentId: userProfile?.studentId || '',
    phone: userProfile?.phone || '',
    bio: userProfile?.bio || '',
    skills: userProfile?.skills?.join(', ') || '',
  });

  useEffect(() => {
    if (!userProfile) return;

    setForm({
      displayName: userProfile.displayName || '',
      faculty: userProfile.faculty || '',
      department: userProfile.department || '',
      studentId: userProfile.studentId || '',
      phone: userProfile.phone || '',
      bio: userProfile.bio || '',
      skills: userProfile.skills?.join(', ') || '',
    });

    setLoadingActivity(true);
    Promise.all([
      getJobsByUser(userProfile.uid),
      getRatingsByUser(userProfile.uid),
    ])
      .then(([jobs, ratings]) => {
        setMyJobs(jobs);
        setMyRatings(ratings);
      })
      .catch((error) => {
        console.error(error);
        toast.error('Không tải được lịch sử hoạt động');
      })
      .finally(() => {
        setLoadingActivity(false);
      });
  }, [userProfile]);

  const completedJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'completed'),
    [myJobs]
  );

  const trustScore = useMemo(() => {
    if (!userProfile?.totalRatings) return 0;
    return Math.max(0, Math.min(100, Math.round((userProfile.ratingScore / 5) * 100)));
  }, [userProfile?.ratingScore, userProfile?.totalRatings]);

  if (!userProfile) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--color-muted-foreground)]">Vui lòng đăng nhập</p>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await updateUserProfile(userProfile.uid, {
        displayName: form.displayName,
        faculty: form.faculty,
        department: form.department,
        studentId: form.studentId,
        phone: form.phone,
        bio: form.bio,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await refreshProfile();
      setIsEditing(false);
      toast.success('Cập nhật profile thành công!');
    } catch (error) {
      toast.error('Lỗi khi cập nhật');
      console.error(error);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-gradient-to-b from-white to-gray-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <p className="mb-6 text-xs font-medium tracking-widest text-[var(--color-muted-foreground)] uppercase opacity-60 sm:text-xs">
        User Profile and Portfolio Page
      </p>

      <div className="grid flex-1 gap-6 xl:grid-cols-12">
        {/* Left Profile Sidebar */}
        <aside className="xl:col-span-4">
          <div className="overflow-hidden rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:p-7 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-shadow duration-300">
            {/* Avatar + Header Info - Centered in Box */}
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="relative mb-4 h-32 w-32 sm:h-36 sm:w-36">
                {userProfile.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName}
                    className="h-full w-full rounded-full border-4 border-emerald-100 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 text-6xl font-semibold text-emerald-600 shadow-lg">
                    {userProfile.displayName?.charAt(0) || '?'}
                  </div>
                )}
                <div className="absolute right-0 bottom-2 rounded-full bg-emerald-500 p-2 text-white shadow-lg">
                  <BadgeCheck className="h-5 w-5" />
                </div>
              </div>

              <span className="inline-block rounded-full bg-emerald-100 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Sinh viên xác thực
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight leading-tight">{userProfile.displayName}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {userProfile.faculty || 'Chưa cập nhật khoa'}
                {userProfile.studentId ? ` • ${userProfile.studentId}` : ''}
              </p>
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-5">
              <div className="flex items-start gap-3">
                <Mail className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Email</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 break-all">{userProfile.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Số điện thoại</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900">{userProfile.phone || 'Chưa cập nhật'}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/cv-export')}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:bg-emerald-600 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <FileDown className="h-4 w-4" />
              Xuất CV Passport
            </button>

            <button
              onClick={() => setIsEditing((prev) => !prev)}
              className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-100 hover:shadow-md flex items-center justify-center gap-2"
            >
              <Edit3 className="h-4 w-4" />
              {isEditing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa hồ sơ'}
            </button>
          </div>
        </aside>

        {/* Right Content */}
        <section className="space-y-6 xl:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="overflow-hidden rounded-2xl bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:p-6 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-shadow duration-300">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Đánh giá trung bình</p>
              <p className="mt-3 text-4xl font-bold tracking-tight leading-none">
                {userProfile.ratingScore > 0 ? userProfile.ratingScore.toFixed(1) : '0.0'}
                <span className="text-xl ml-1 font-semibold text-gray-400">/ 5</span>
              </p>
              <div className="mt-3 flex gap-1.5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={`h-4 w-4 ${
                      index < Math.round(userProfile.ratingScore)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:p-6 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-shadow duration-300">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Điểm uy tín</p>
              <p className="mt-3 text-4xl font-bold tracking-tight leading-none">{trustScore}<span className="text-xl ml-1 font-semibold text-gray-400">%</span></p>
              <div className="mt-4 h-2.5 rounded-full bg-gray-100">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${trustScore}%` }}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:p-6 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-shadow duration-300 sm:col-span-2 lg:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Đã hoàn thành</p>
              <p className="mt-3 text-4xl font-bold tracking-tight leading-none">{completedJobs.length}</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Công việc</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-shadow duration-300">
            <div className="border-b border-gray-100 p-6">
              <h3 className="text-xl font-bold tracking-tight leading-tight">Lịch sử hoạt động</h3>
            </div>

            <div className="border-b border-gray-100">
              <div className="flex overflow-x-auto">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`min-w-max border-b-2 px-6 py-3.5 text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === 'all'
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`min-w-max border-b-2 px-6 py-3.5 text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === 'completed'
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  Hoàn thành
                </button>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className={`min-w-max border-b-2 px-6 py-3.5 text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === 'reviews'
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  Đánh giá
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100 p-6">
              {loadingActivity && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-16 animate-pulse rounded-lg bg-gray-50"
                    />
                  ))}
                </div>
              )}

              {!loadingActivity && activeTab !== 'reviews' && (
                <div className="space-y-3 -my-6">
                  {(activeTab === 'all' ? myJobs : completedJobs).map((job) => (
                    <article
                      key={job.id}
                      className="flex flex-col gap-3 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">{job.title}</h4>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(job.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          job.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : job.status === 'in-progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {job.status === 'completed'
                          ? 'Hoàn thành'
                          : job.status === 'in-progress'
                            ? 'Đang thực hiện'
                            : 'Mở'}
                      </span>
                    </article>
                  ))}
                </div>
              )}

              {!loadingActivity && activeTab === 'reviews' && (
                <div className="space-y-3 -my-6">
                  {myRatings.map((rating) => (
                    <article
                      key={rating.id}
                      className="rounded-lg bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">Từ người thuê</p>
                        <span className="flex items-center gap-1 text-sm font-semibold text-amber-500">
                          <Star className="h-4 w-4 fill-current" />
                          {rating.score.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">
                        {rating.comment || 'Không có nhận xét'}
                      </p>
                    </article>
                  ))}
                </div>
              )}

              {!loadingActivity && activeTab !== 'reviews' && (activeTab === 'all' ? myJobs : completedJobs).length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                  Chưa có hoạt động nào
                </div>
              )}

              {!loadingActivity && activeTab === 'reviews' && myRatings.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                  Chưa có đánh giá
                </div>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <div className="border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-transparent p-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-lg font-bold">Cập nhật thông tin</h3>
                </div>
              </div>

              <div className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Họ và tên</label>
                    <div className="relative">
                      <Award className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[var(--color-muted-foreground)]" />
                      <input
                        type="text"
                        value={form.displayName}
                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Khoa</label>
                    <div className="relative">
                      <BookOpen className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[var(--color-muted-foreground)]" />
                      <select
                        value={form.faculty}
                        onChange={(e) => setForm({ ...form, faculty: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                      >
                        <option value="">Chọn khoa</option>
                        {FACULTIES.map((faculty) => (
                          <option key={faculty} value={faculty}>
                            {faculty}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Bộ môn</label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">MSSV</label>
                    <input
                      type="text"
                      value={form.studentId}
                      onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Số điện thoại</label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[var(--color-muted-foreground)]" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Giới thiệu</label>
                    <textarea
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition resize-none"
                      placeholder="Kể về bản thân, kinh nghiệm, và tình yêu thích của bạn..."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Kỹ năng</label>
                    <input
                      type="text"
                      value={form.skills}
                      onChange={(e) => setForm({ ...form, skills: e.target.value })}
                      placeholder="React, Python, Thiết kế (phân cách bằng dấu phẩy)..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition"
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-gray-100 pt-6">
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:bg-emerald-600 transition-all duration-200"
                  >
                    <Save className="h-4 w-4" />
                    Lưu thay đổi
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-gray-50 transition"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
