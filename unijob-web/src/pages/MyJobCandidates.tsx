import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, FileText, Star, UserRound } from 'lucide-react';
import { getJobById, updateApplicationStatus, subscribeToJobApplications } from '@/services/job.service';
import { getUserById } from '@/services/user.service';
import type { Application, Job } from '@/types';
import type { User } from '@/types/user';
import toast from 'react-hot-toast';
import './my-job-candidates.css';

export default function MyJobCandidates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');

  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setLoading(true);
    getJobById(jobId)
      .then((data) => setJob(data))
      .catch((err) => {
        console.error(err);
        toast.error('Không tải được thông tin công việc');
      })
      .finally(() => setLoading(false));

    const unsub = subscribeToJobApplications(jobId, (apps) => {
      const pendingApps = apps.filter((a) => a.status === 'pending');
      setApplications(pendingApps);

      const missingIds = pendingApps.map((a) => a.applicantId);
      
      setUserProfiles((prev) => {
        const fetchIds = missingIds.filter((id) => !prev[id]);
        if (fetchIds.length > 0) {
          Promise.all(
            fetchIds.map(async (id) => {
              const user = await getUserById(id);
              if (user) {
                setUserProfiles((latest) => ({ ...latest, [id]: user }));
              }
            })
          );
        }
        return prev;
      });
    });

    return unsub;
  }, [jobId]);

  async function handleAccept(applicationId: string) {
    setAccepting(applicationId);
    try {
      await updateApplicationStatus(applicationId, 'accepted');
      // Reject all other pending applications
      await Promise.all(
        applications
          .filter((a) => a.id !== applicationId)
          .map((a) => updateApplicationStatus(a.id, 'rejected'))
      );
      toast.success('Đã chấp nhận ứng viên!');
      navigate('/my-jobs');
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi chấp nhận ứng viên');
    } finally {
      setAccepting(null);
    }
  }

  async function handleReject(applicationId: string) {
    try {
      await updateApplicationStatus(applicationId, 'rejected');
      setApplications((prev) => prev.filter((a) => a.id !== applicationId));
      toast.success('Đã từ chối ứng viên');
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi từ chối ứng viên');
    }
  }

  if (loading) {
    return (
      <div className="candidates-page">
        <div className="candidates-container flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="candidates-page">
      <div className="candidates-container">
        <button onClick={() => navigate('/my-jobs')} className="candidates-back-link" type="button">
          <ChevronLeft className="h-4 w-4" />
          Quay lại danh sách việc
        </button>

        <h1 className="candidates-title">Danh sách ứng viên</h1>

        {job && (
          <section className="candidates-job-card">
            <p className="candidates-job-title">
              Công việc: <span>{job.title}</span>
            </p>
            <div className="candidates-job-meta">
              <span className="candidates-price">
                {job.payment > 0
                  ? new Intl.NumberFormat('vi-VN').format(job.payment) + 'đ'
                  : 'Tình nguyện'}
              </span>
              <span className="candidates-status">
                Đang tìm người ({applications.length} ứng viên)
              </span>
            </div>
          </section>
        )}

        {applications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-16 text-center text-sm text-gray-400">
            Chưa có ứng viên nào
          </div>
        ) : (
          <div className="candidates-list">
            {applications.map((app) => {
              const profile = userProfiles[app.applicantId];
              return (
                <article key={app.id} className="candidate-card">
                  <div className="candidate-left">
                    <div className="candidate-avatar-wrap">
                      {profile?.photoURL ? (
                        <img src={profile.photoURL} alt={app.applicantName} className="candidate-avatar rounded-full" />
                      ) : (
                        <div className="candidate-avatar"><UserRound className="h-10 w-10" /></div>
                      )}
                    </div>
                    <h3 className="candidate-name">{app.applicantName}</h3>
                    <p className="candidate-faculty">{profile?.faculty || 'Chưa cập nhật'}</p>
                    <div className="candidate-rating">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="candidate-rating-score">
                        {profile?.ratingScore ? profile.ratingScore.toFixed(1) : '0.0'}/5
                      </span>
                      <span className="candidate-rating-count">({profile?.totalRatings ?? 0} đánh giá)</span>
                    </div>
                  </div>

                  <div className="candidate-message-col">
                    <p className="candidate-message-label">Lời nhắn / Cover Letter:</p>
                    <p className="candidate-message">{app.message || 'Không có lời nhắn.'}</p>
                  </div>

                  <div className="candidate-actions">
                    <button
                      className="candidate-btn candidate-btn-accept"
                      type="button"
                      disabled={accepting === app.id}
                      onClick={() => handleAccept(app.id)}
                    >
                      {accepting === app.id ? 'Đang xử lý...' : 'Chấp nhận'}
                    </button>
                    <button
                      className="candidate-btn candidate-btn-reject"
                      type="button"
                      onClick={() => handleReject(app.id)}
                    >
                      Từ chối
                    </button>
                    <button
                      className="candidate-link"
                      type="button"
                      onClick={() => navigate(`/profile?uid=${app.applicantId}`)}
                    >
                      <FileText className="h-4 w-4" />
                      Xem hồ sơ chi tiết
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
