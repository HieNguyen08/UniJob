import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobs } from '@/services/job.service';
import { getRatingsByUser } from '@/services/rating.service';
import { generateCVCertificate } from '@/services/cv.service';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';
import type { User } from '@/types/user';
import { getUserById } from '@/services/user.service';
import { FileDown, Share2, Star, Briefcase, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CVExport() {
  const navigate = useNavigate();
  const { isAuthenticated, userProfile } = useAuthStore();
  const [user, setUser] = useState<User | null>(null);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailedRatings, setShowDetailedRatings] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !userProfile) {
      navigate('/login');
      return;
    }

    async function fetchData() {
      try {
        const [userData, allJobs, userRatings] = await Promise.all([
          getUserById(userProfile!.uid),
          getJobs({ status: 'completed' }),
          getRatingsByUser(userProfile!.uid),
        ]);

        setUser(userData);
        // Filter jobs where user was assigned
        const myCompleted = allJobs.filter(
          (job) => job.assignedTo?.includes(userProfile!.uid) || job.postedBy === userProfile!.uid
        );
        setCompletedJobs(myCompleted);
        setRatings(userRatings);
      } catch (error) {
        console.error('Error fetching CV data:', error);
        toast.error('Lỗi khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isAuthenticated, userProfile, navigate]);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      await generateCVCertificate(user, completedJobs, ratings, { showDetailedRatings });
      toast.success('Đã tải xuống PDF!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Lỗi khi xuất PDF');
    } finally {
      setExporting(false);
    }
  };

  const totalHours = completedJobs.reduce((sum, job) => {
    const duration = parseFloat(job.duration) || 2;
    return sum + duration;
  }, 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-gray-200" />
          <div className="h-96 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Chứng nhận kinh nghiệm thực tế</h1>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* LEFT: Certificate Preview */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
            {/* Green top bar */}
            <div className="h-3 bg-emerald-500" />

            <div className="p-8">
              {/* Logo */}
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500">
                  <Briefcase className="h-6 w-6 text-white" />
                </div>
              </div>

              {/* Title */}
              <h2 className="mb-1 text-center text-lg font-bold text-gray-800 tracking-wide">
                CHỨNG NHẬN KINH NGHIỆM THỰC TẾ
              </h2>
              <p className="mb-6 text-center text-xs text-gray-500">
                Chứng nhận cấp cho sinh viên
              </p>

              {/* User Info */}
              <h3 className="mb-1 text-center text-xl font-bold text-gray-900">
                {user?.displayName || 'Sinh viên'}
              </h3>
              <p className="mb-6 text-center text-sm text-gray-500">
                {[user?.faculty, user?.studentId ? `MSSV: ${user.studentId}` : '']
                  .filter(Boolean)
                  .join(' - ')}
              </p>

              {/* 3 Stat Boxes */}
              <div className="mb-8 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                    <Briefcase className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{completedJobs.length}</p>
                  <p className="text-xs text-gray-500">Thực tập</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100">
                    <Star className="h-4 w-4 text-yellow-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {user?.ratingScore ? `${user.ratingScore}/5` : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">Đánh giá TB</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{Math.round(totalHours)}</p>
                  <p className="text-xs text-gray-500">Giờ thực tập</p>
                </div>
              </div>

              {/* Completed Projects */}
              <div>
                <p className="mb-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  DANH SÁCH DỰ ÁN ĐÃ HOÀN THÀNH
                </p>
                <div className="divide-y divide-gray-100">
                  {completedJobs.length > 0 ? (
                    completedJobs.slice(0, 8).map((job) => (
                      <div key={job.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{job.title}</p>
                            <p className="text-xs text-emerald-600">{job.category}</p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {job.createdAt
                            ? new Date(job.createdAt.toDate()).toLocaleDateString('vi-VN')
                            : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm italic text-gray-400">
                      Chưa có dự án nào hoàn thành.
                    </p>
                  )}
                  {completedJobs.length > 8 && (
                    <p className="py-2 text-center text-xs text-gray-400">
                      ... và {completedJobs.length - 8} dự án khác
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-4">
                <div className="h-10 w-10 rounded border border-gray-200 p-1">
                  <div className="flex h-full w-full items-center justify-center text-[6px] text-gray-400">
                    QR
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">UniJob</p>
                  <p className="text-xs text-gray-500">Kết nối việc làm Sinh viên</p>
                </div>
              </div>
            </div>

            {/* Green bottom bar */}
            <div className="h-3 bg-emerald-500" />
          </div>
        </div>

        {/* RIGHT: Export Options */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
            <h3 className="mb-6 text-lg font-semibold">Tùy chọn xuất file</h3>

            {/* Download PDF Button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              <FileDown className="h-5 w-5" />
              {exporting ? 'Đang xuất...' : 'Tải xuống PDF'}
            </button>

            {/* Share LinkedIn Button */}
            <button
              onClick={() => toast('Tính năng đang phát triển', { icon: 'ℹ️' })}
              className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500 px-6 py-3 font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
            >
              <Share2 className="h-5 w-5" />
              Chia sẻ lên LinkedIn
            </button>

            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Hiển thị đánh giá chi tiết khi chia sẻ</span>
              <button
                onClick={() => setShowDetailedRatings(!showDetailedRatings)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  showDetailedRatings ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    showDetailedRatings ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Info note */}
            <div className="mt-6 rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                Lưu ý: File PDF sẽ bao gồm thông tin cá nhân,
                danh sách dự án đã hoàn thành và đánh giá từ người thuê.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
