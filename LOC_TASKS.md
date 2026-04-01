# UniJob — Hướng dẫn công việc còn lại cho Lộc

> **Người viết:** Nguyễn Minh Hiếu (Tech Lead)  
> **Người thực hiện:** Lộc  
> **Deadline:** 14/04/2026  
> **Branch làm việc:** `git checkout -b feature/loc-backend` từ `main`

---

## Tổng quan

Có **3 nhóm nhiệm vụ** cần hoàn thành:

| # | Nhóm | Mô tả | Độ ưu tiên |
|---|------|-------|-----------|
| A | **Thay mock data → Firebase thật** | 3 trang của Minh đang dùng data giả cứng | 🔴 P0 |
| B | **Backend còn lại (50%)** | Security Rules, Cancel Policy, Work History, Realtime | 🟠 P1 |
| C | **Advanced Features (Part 5)** | Xác nhận CV Passport + AI Suggest hoạt động end-to-end | 🟡 P2 |

---

## NHÓM A — Thay mock data bằng Firebase thật

### A.1 — MyJobs.tsx

**File:** `unijob-web/src/pages/MyJobs.tsx`

**Vấn đề:** Toàn bộ `receivedJobs[]` và `postedJobs[]` là data cứng. Stats `2, 1, 15` cũng cứng.

**Services đã có sẵn (không cần viết thêm):**
- `getApplicationsByUser(uid)` → lấy việc mình đã ứng tuyển
- `getJobsByUser(uid)` → lấy việc mình đã đăng
- `getJobById(jobId)` → lấy chi tiết một job
- `getJobCompletion(jobId)` → lấy trạng thái hoàn thành

**Thay đổi cần làm:**

1. Thêm imports ở đầu file:

```tsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  getApplicationsByUser,
  getJobsByUser,
  getJobById,
} from '@/services/job.service';
import { getJobCompletion } from '@/services/rating.service';
import type { Job, Application } from '@/types';
import toast from 'react-hot-toast';
```

2. Xóa toàn bộ các block mock data cứng:
```tsx
// XÓA HẾT 2 BLOCK NÀY:
const receivedJobs: ReceivedJob[] = [ ... ];
const postedJobs: PostedJob[] = [ ... ];
```

3. Bên trong component `MyJobs()`, thay `const navigate = useNavigate();` thành:

```tsx
const navigate = useNavigate();
const { userProfile } = useAuthStore();
const [receivedJobs, setReceivedJobs] = useState<ReceivedJob[]>([]);
const [postedJobs, setPostedJobs] = useState<PostedJob[]>([]);
const [loading, setLoading] = useState(true);
```

4. Thêm `useEffect` để load data thật (sau phần khai báo state):

```tsx
useEffect(() => {
  if (!userProfile) return;

  async function loadJobs() {
    try {
      // --- Việc tôi nhận (applications) ---
      const applications = await getApplicationsByUser(userProfile!.uid);
      const receivedList: ReceivedJob[] = await Promise.all(
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
          const { getApplicationsByJob } = await import('@/services/job.service');
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
  }

  loadJobs();
}, [userProfile]);
```

5. Thay stats cứng bằng tính toán thật. Xóa block `const stats = useMemo(...)` hiện tại và thay bằng:

```tsx
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
```

6. Thay hardcoded job limit bar. Tìm dòng:
```tsx
<span>Giới hạn nhận việc: 2/3 job đang chạy</span>
```
Thay bằng:
```tsx
<span>
  Giới hạn nhận việc: {userProfile?.activeJobCount ?? 0}/{userProfile?.maxJobLimit ?? 2} job đang chạy
</span>
```

7. Thay navigation hardcoded id `'p1'` và `'p2'` bằng job.id thật. Tìm phần:
```tsx
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
```
Thay bằng:
```tsx
onClick={() => {
  if (job.status === 'finding') {
    navigate(`/my-jobs/candidates?jobId=${job.id}`);
  } else if (job.status === 'pending') {
    navigate(`/my-jobs/acceptance?jobId=${job.id}`);
  }
}}
```

8. Thêm loading state vào JSX. Tìm `<div className="myjobs-page">` và thêm điều kiện:
```tsx
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
```

---

### A.2 — MyJobCandidates.tsx

**File:** `unijob-web/src/pages/MyJobCandidates.tsx`

**Vấn đề:** `candidates[]` cứng. Nút "Chấp nhận"/"Từ chối" không làm gì.

1. Thêm imports:

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApplicationsByJob, getJobById, updateApplicationStatus } from '@/services/job.service';
import { getUserById } from '@/services/user.service';
import type { Application, Job } from '@/types';
import type { User } from '@/types/user';
import toast from 'react-hot-toast';
```

2. Xóa block `const candidates: Candidate[] = [...]` cứng.

3. Thay toàn bộ nội dung component:

```tsx
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
    async function load() {
      try {
        const [jobData, apps] = await Promise.all([
          getJobById(jobId!),
          getApplicationsByJob(jobId!),
        ]);
        setJob(jobData);
        setApplications(apps.filter((a) => a.status === 'pending'));

        // Load profiles for each applicant
        const profiles: Record<string, User> = {};
        await Promise.all(
          apps.map(async (app) => {
            const user = await getUserById(app.applicantId);
            if (user) profiles[app.applicantId] = user;
          })
        );
        setUserProfiles(profiles);
      } catch (err) {
        console.error(err);
        toast.error('Không tải được danh sách ứng viên');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  async function handleAccept(applicationId: string, applicantId: string) {
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
                      onClick={() => handleAccept(app.id, app.applicantId)}
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
```

---

### A.3 — MyJobAcceptance.tsx

**File:** `unijob-web/src/pages/MyJobAcceptance.tsx`

**Vấn đề:** Mọi thứ đều là data cứng. Nút "Xác nhận" không làm gì.

1. Thêm imports:

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getJobById } from '@/services/job.service';
import { getJobCompletion, confirmCompletion } from '@/services/rating.service';
import { getUserById } from '@/services/user.service';
import type { Job, JobCompletion } from '@/types';
import type { User } from '@/types/user';
import toast from 'react-hot-toast';
```

2. Thay toàn bộ nội dung component:

```tsx
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
```

---

## NHÓM B — Backend còn lại (50%)

### B.1 — Firestore Security Rules

**File cần tạo mới:** `unijob-web/firestore.rules`

Tạo file này ở thư mục `unijob-web/`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuth() {
      return request.auth != null;
    }
    function isOwner(userId) {
      return isAuth() && request.auth.uid == userId;
    }

    // USERS: chỉ đọc public info, chỉ chủ tài khoản mới sửa được
    match /users/{userId} {
      allow read: if isAuth();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
      allow delete: if false;
    }

    // JOBS: ai đăng nhập cũng đọc được, chỉ người đăng mới sửa/xóa
    match /jobs/{jobId} {
      allow read: if isAuth();
      allow create: if isAuth();
      allow update: if isAuth() && (
        resource.data.postedBy == request.auth.uid ||
        // Cho phép update applicants khi ứng tuyển
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['applicants', 'updatedAt'])
      );
      allow delete: if isAuth() && resource.data.postedBy == request.auth.uid;
    }

    // APPLICATIONS: applicant đọc được đơn của mình, poster đọc đơn vào job của mình
    match /applications/{appId} {
      allow read: if isAuth() && (
        resource.data.applicantId == request.auth.uid ||
        // poster đọc: cần check qua jobs collection
        exists(/databases/$(database)/documents/jobs/$(resource.data.jobId)) &&
        get(/databases/$(database)/documents/jobs/$(resource.data.jobId)).data.postedBy == request.auth.uid
      );
      allow create: if isAuth() && request.resource.data.applicantId == request.auth.uid;
      allow update: if isAuth() && (
        // chỉ poster mới được đổi status
        get(/databases/$(database)/documents/jobs/$(resource.data.jobId)).data.postedBy == request.auth.uid
      );
      allow delete: if false;
    }

    // RATINGS: ai đăng nhập cũng đọc, chỉ người trong job mới tạo được
    match /ratings/{ratingId} {
      allow read: if isAuth();
      allow create: if isAuth() && request.resource.data.fromUserId == request.auth.uid;
      allow update, delete: if false;
    }

    // JOB COMPLETIONS: người trong job mới đọc/update được
    match /jobCompletions/{completionId} {
      allow read: if isAuth();
      allow create: if isAuth();
      allow update: if isAuth();
      allow delete: if false;
    }

    // WORK HISTORY: public read
    match /workHistory/{historyId} {
      allow read: if isAuth();
      allow create: if isAuth();
      allow update, delete: if false;
    }
  }
}
```

**Deploy rules lên Firebase:**
```bash
npm install -g firebase-tools
firebase login
firebase use unijob-ad6eb
firebase deploy --only firestore:rules
```

---

### B.2 — Cancel Policy với Trust Score Penalty

**File cần tạo mới:** `unijob-web/src/services/cancel.service.ts`

```ts
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserById, updateUserProfile } from '@/services/user.service';
import { updateJob } from '@/services/job.service';
import { updateApplicationStatus } from '@/services/job.service';

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
  reason: CancelReason,
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
  await updateJob(jobId, { status: 'open' });

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

  await updateJob(jobId, { status: 'cancelled' });

  return {
    penaltyPoints,
    message: penaltyPoints > 0
      ? `Đã hủy việc — bạn bị trừ ${penaltyPoints} điểm uy tín vì đã có người nhận việc.`
      : 'Đã hủy việc thành công.',
  };
}
```

**Cách dùng trong CancelModal của MyJobs.tsx** — sau khi user bấm "Xác nhận Hủy":

```tsx
// Trong CancelModal, khi step 2 confirm:
import { workerCancelJob } from '@/services/cancel.service';

const result = await workerCancelJob(jobId, applicationId, workerId, reason, job.deadline);
toast.success(result.message);
navigate('/my-jobs');
```

---

### B.3 — Work History Pair Tracking

**File cần tạo mới:** `unijob-web/src/services/workHistory.service.ts`

```ts
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  or,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface WorkHistoryEntry {
  id: string;
  user1: string;
  user2: string;
  jobId: string;
  completedAt: Timestamp;
}

const workHistoryCollection = collection(db, 'workHistory');

/**
 * Record a completed collaboration between poster and worker
 */
export async function recordWorkHistory(
  posterId: string,
  workerId: string,
  jobId: string
): Promise<string> {
  const docRef = await addDoc(workHistoryCollection, {
    user1: posterId,
    user2: workerId,
    jobId,
    completedAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Get all past collaborators for a user
 */
export async function getWorkHistory(userId: string): Promise<WorkHistoryEntry[]> {
  const q = query(
    workHistoryCollection,
    or(where('user1', '==', userId), where('user2', '==', userId))
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as WorkHistoryEntry[];
}

/**
 * Check if two users have worked together before
 */
export async function haveWorkedTogether(userId1: string, userId2: string): Promise<boolean> {
  const q = query(workHistoryCollection, where('user1', '==', userId1), where('user2', '==', userId2));
  const q2 = query(workHistoryCollection, where('user1', '==', userId2), where('user2', '==', userId1));
  const [s1, s2] = await Promise.all([getDocs(q), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}
```

**Kết nối vào flow hoàn thành:** Trong `confirmCompletion` ở `rating.service.ts`, sau khi cả 2 xác nhận (`workerConfirmed && posterConfirmed`), gọi thêm:

```ts
import { recordWorkHistory } from '@/services/workHistory.service';

// Khi poster confirm — cần lấy thêm workerId từ job
await recordWorkHistory(job.postedBy, job.assignedTo[0], job.id);
```

---

### B.4 — Real-time Subscriptions (onSnapshot)

Thêm hàm realtime vào **cuối file** `unijob-web/src/services/job.service.ts`:

```ts
import { onSnapshot } from 'firebase/firestore';

/**
 * Subscribe to real-time updates for jobs the user posted
 * Returns an unsubscribe function — call it in useEffect cleanup
 */
export function subscribeToMyPostedJobs(
  userId: string,
  onUpdate: (jobs: Job[]) => void
): () => void {
  const q = query(jobsCollection, where('postedBy', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Job[];
    onUpdate(jobs);
  });
}

/**
 * Subscribe to real-time updates on applications for a specific job
 */
export function subscribeToJobApplications(
  jobId: string,
  onUpdate: (apps: Application[]) => void
): () => void {
  const q = query(applicationsCollection, where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Application[];
    onUpdate(apps);
  });
}
```

**Cách dùng trong `MyJobCandidates.tsx`** (thay `useEffect` tải ứng viên):

```tsx
useEffect(() => {
  if (!jobId) return;
  const unsub = subscribeToJobApplications(jobId, (apps) => {
    setApplications(apps.filter((a) => a.status === 'pending'));
  });
  return unsub; // cleanup tự động unsubscribe
}, [jobId]);
```

---

## NHÓM C — Advanced Features (Part 5 — điểm Hiếu giao cho Lộc verify)

Hai advanced features đã được implement sẵn. Lộc cần **verify chạy đúng** và **document cho báo cáo**.

### C.1 — CV Passport Export (jsPDF)

**File:** `unijob-web/src/pages/CVExport.tsx` + `unijob-web/src/services/cv.service.ts`

**Test thủ công:**
1. Đăng nhập → vào `/cv-export`
2. Bấm "Xuất PDF"
3. Kiểm tra file PDF tải về có: tên, khoa, rating, danh sách completed jobs

**Nếu không thấy jobs** trong PDF → thêm seed data completed job cho user đang test (xem file `scripts/seed.mjs`).

**Mô tả cho báo cáo (Part 5):**
> **CV Passport Export** sử dụng `jsPDF` để tạo chứng chỉ điện tử xác nhận kinh nghiệm làm việc thực tế của sinh viên — là ví dụ điển hình của *4th wave e-commerce: platform as credential issuer*. Sinh viên dùng CV Passport để ứng tuyển việc làm bên ngoài trường, biến lịch sử giao dịch trên UniJob thành tài sản số có thể xác minh.

### C.2 — AI Job Matching (Smart Suggestions)

**File:** `unijob-web/src/services/suggest.service.ts` + `unijob-web/src/components/job/SuggestedJobs.tsx`

**Test thủ công:**
1. Đăng nhập bằng tài khoản có `faculty` và `skills` điền đầy đủ trong profile
2. Vào trang `/` → phần **"Đề xuất cho bạn"** phải hiện 3–6 job card
3. Score cao nhất = job cùng khoa + có tags khớp skills

**Nếu không hiện** → lý do thường là chưa có data trên Firestore. Sau khi seed xong (khi Firestore được bật) sẽ hiện tự động.

**Mô tả cho báo cáo (Part 5):**
> **AI Job Matching** dùng thuật toán điểm số đa tiêu chí (faculty match 40pts + skills/tags 30pts + category affinity 20pts + recency 10pts + urgent bonus 5pts) để gợi ý công việc phù hợp nhất với từng sinh viên — minh họa ứng dụng *personalization* trong e-commerce thế hệ 4. Hệ thống không dùng ML model mà sử dụng rule-based scoring để phù hợp với giới hạn Firebase free tier.

---

## Checklist hoàn thành

```
Nhóm A — Mock data → Firebase
[ ] MyJobs.tsx: load receivedJobs từ getApplicationsByUser
[ ] MyJobs.tsx: load postedJobs từ getJobsByUser
[ ] MyJobs.tsx: stats tính từ real data
[ ] MyJobs.tsx: navigation truyền jobId qua query param
[ ] MyJobCandidates.tsx: load từ getApplicationsByJob, load user profiles
[ ] MyJobCandidates.tsx: nút Chấp nhận / Từ chối gọi updateApplicationStatus
[ ] MyJobAcceptance.tsx: load từ getJobById + getJobCompletion
[ ] MyJobAcceptance.tsx: nút Xác nhận gọi confirmCompletion

Nhóm B — Backend
[ ] firestore.rules tạo xong và deploy
[ ] cancel.service.ts tạo xong
[ ] workHistory.service.ts tạo xong
[ ] Thêm subscribeToMyPostedJobs + subscribeToJobApplications vào job.service.ts

Nhóm C — Advanced Features
[ ] Test CV Passport xuất PDF thành công
[ ] Test AI Suggest hiện đúng jobs theo khoa/skills
[ ] Viết mô tả 2 features cho Part 5 báo cáo

Seed data
[ ] Firestore đã được bật trên Firebase Console
[ ] Chạy: node scripts/seed.mjs
```

---

## Lưu ý quan trọng

- **Không được xóa file .css của Minh** (`my-jobs.css`, `my-job-candidates.css`, `my-job-acceptance.css`) — chỉ thay logic, giữ nguyên UI class names
- **Chạy `npm run build` sau mỗi nhóm** để check TypeScript errors trước khi push
- **Branch:** làm trên `feature/loc-backend`, tạo PR vào `main` khi xong — Hiếu review và merge
- **Firebase Console:** cần bật Firestore và chạy seed trước khi test A.1–A.3
