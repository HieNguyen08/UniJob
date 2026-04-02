import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock3, Phone } from 'lucide-react';
import { getJobById } from '@/services/job.service';
import { getJobCompletion, confirmCompletion } from '@/services/rating.service';
import { getUserById } from '@/services/user.service';
import type { Job, JobCompletion } from '@/types';
import type { User } from '@/types/user';
import toast from 'react-hot-toast';
import './my-job-acceptance.css';

export default function MyJobAcceptance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');

  const [job, setJob] = useState<Job | null>(null);
  const [completion, setCompletion] = useState<JobCompletion | null>(null);
  const [worker, setWorker] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    async function load() {
      try {
        const [jobData, completionData] = await Promise.all([
          getJobById(jobId!),
          getJobCompletion(jobId!),
        ]);
        setJob(jobData);
        setCompletion(completionData);

        // Load worker profile
        if (jobData?.assignedTo?.[0]) {
          const workerProfile = await getUserById(jobData.assignedTo[0]);
          setWorker(workerProfile);
        }
      } catch (err) {
        console.error(err);
        toast.error('Không tải được thông tin công việc');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  async function handleConfirm() {
    if (!completion) return;
    setConfirming(true);
    try {
      await confirmCompletion(completion.id, 'poster');
      toast.success('Đã xác nhận! Hệ thống sẽ mở tính năng đánh giá.');
      navigate('/my-jobs');
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi xác nhận');
    } finally {
      setConfirming(false);
    }
  }

  const formatDate = (ts: unknown) => {
    if (!ts || typeof ts !== 'object') return 'N/A';
    const t = ts as { toDate?: () => Date };
    return t.toDate ? t.toDate().toLocaleDateString('vi-VN') : 'N/A';
  };

  if (loading) {
    return (
      <div className="accept-page">
        <div className="accept-shell flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="accept-page">
        <div className="accept-shell">
          <p className="text-center text-gray-500 py-20">Không tìm thấy công việc.</p>
        </div>
      </div>
    );
  }

  const workerInitials = worker?.displayName
    ? worker.displayName.split(' ').map((n) => n[0]).slice(-2).join('')
    : 'SV';

  return (
    <div className="accept-page">
      <div className="accept-shell">
        <button className="accept-back-link" type="button" onClick={() => navigate('/my-jobs')}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại trang công việc của tôi
        </button>
        <h1 className="accept-page-title">Xác nhận đã làm xong</h1>

        <section className="accept-card">
          <div className="accept-header-row">
            <div>
              <h2 className="accept-job-title">{job.title}</h2>
              <p className="accept-job-id">Mã công việc: #{job.id.slice(-8).toUpperCase()}</p>
            </div>
            <span className="accept-pill">Chờ xác nhận nghiệm thu</span>
          </div>

          <div className="accept-timeline-wrap">
            <div className="accept-timeline-line" />
            <div className="accept-steps">
              <div className="accept-step done">
                <div className="accept-step-icon"><CheckCircle2 className="h-4 w-4" /></div>
                <p>Đã nhận việc</p>
                <small>{formatDate(job.createdAt)}</small>
              </div>
              <div className={`accept-step ${completion?.workerConfirmed ? 'done' : 'active'}`}>
                <div className="accept-step-icon">
                  {completion?.workerConfirmed
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Clock3 className="h-4 w-4" />}
                </div>
                <p>Sinh viên báo hoàn thành</p>
                <small>{completion?.workerConfirmed ? 'Đã nộp' : 'Chờ nộp'}</small>
              </div>
              <div className={`accept-step ${completion?.posterConfirmed ? 'done' : 'active'}`}>
                <div className="accept-step-icon">
                  {completion?.posterConfirmed
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Clock3 className="h-4 w-4" />}
                </div>
                <p>Người đăng xác nhận</p>
                <small>{completion?.posterConfirmed ? 'Đã xác nhận' : 'Đang chờ bạn'}</small>
              </div>
              <div className="accept-step muted">
                <div className="accept-step-icon">4</div>
                <p>Thanh toán & Đánh giá</p>
                <small>{completion?.status === 'confirmed' ? 'Hoàn thành' : 'Chờ xử lý'}</small>
              </div>
            </div>
          </div>

          <div className="accept-result-wrap">
            <p className="accept-section-title">Thông tin sinh viên thực hiện</p>
            <div className="accept-user-row">
               <div className="accept-user-avatar">{workerInitials}</div>
              <div>
                <p className="accept-user-name">{worker?.displayName || 'Sinh viên'}</p>
                <p className="accept-user-msg">{worker?.faculty || ''}</p>
              </div>
            </div>
          </div>

          {!completion?.posterConfirmed && (
            <div className="accept-warning-box">
              <div className="accept-warning-title-row">
                <AlertTriangle className="h-4 w-4" />
                <h3>Xác nhận nghiệm thu công việc</h3>
              </div>
              <p>Vui lòng kiểm tra kỹ kết quả trước khi xác nhận. Sau khi xác nhận sẽ không được hoàn tác.</p>
              <div className="accept-warning-actions">
                <button
                  type="button"
                  className="accept-confirm-btn"
                  disabled={confirming || !completion?.workerConfirmed}
                  onClick={handleConfirm}
                >
                  {confirming ? 'Đang xử lý...' : 'Xác nhận: Đã nhận kết quả'}
                </button>
              </div>
              {!completion?.workerConfirmed && (
                <p className="accept-warning-note text-amber-600">
                  ⚠ Đang chờ sinh viên báo cáo hoàn thành trước.
                </p>
              )}
              <p className="accept-warning-note">Hệ thống sẽ mở tính năng đánh giá sau khi xác nhận</p>
            </div>
          )}

          <section className="accept-footer">
            <p className="accept-footer-note">
              Lưu ý: Mọi hành vi xác nhận sai sự thật sẽ bị trừ điểm uy tín và có thể dẫn đến khóa tài khoản.
            </p>
            <div className="accept-footer-grid">
              <div>
                <p>Thù lao</p>
                <strong>
                  {job.payment > 0
                    ? new Intl.NumberFormat('vi-VN').format(job.payment) + ' VNĐ'
                    : 'Tình nguyện'}
                </strong>
              </div>
              <div>
                <p>Hạn chót</p>
                <strong>{formatDate(job.deadline)}</strong>
              </div>
              <div>
                <p>Sinh viên</p>
                <strong>{worker?.displayName || 'N/A'}</strong>
              </div>
            </div>
          </section>
        </section>

        <button onClick={() => navigate('/my-jobs')} className="accept-help-link" type="button">
          <Phone className="h-4 w-4" />
          Cần hỗ trợ? Liên hệ bộ phận hỗ trợ
        </button>
      </div>
    </div>
  );
}
