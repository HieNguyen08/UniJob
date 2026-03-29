import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobsByUser } from '@/services/job.service';
import { getApplicationsByUser } from '@/services/job.service';
import type { Job, Application } from '@/types';
import { Briefcase, Send, Clock, CheckCircle, PlusCircle, Eye } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { JOB_CATEGORIES } from '@/lib/constants';

type Tab = 'posted' | 'applied';

export default function Dashboard() {
  const { userProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('posted');
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile) {
      Promise.all([
        getJobsByUser(userProfile.uid),
        getApplicationsByUser(userProfile.uid),
      ]).then(([jobs, apps]) => {
        setMyJobs(jobs);
        setMyApplications(apps);
        setLoading(false);
      });
    }
  }, [userProfile]);

  if (!userProfile) {
    return (
      <div className="py-20 text-center">
        <p>Vui lòng đăng nhập</p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-green-100 text-green-700',
      'in-progress': 'bg-blue-100 text-blue-700',
      completed: 'bg-gray-100 text-gray-700',
      cancelled: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
      accepted: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] || 'bg-gray-100'}`}>
        {status === 'in-progress' ? 'Đang thực hiện' : status === 'open' ? 'Đang mở' : status === 'completed' ? 'Hoàn thành' : status === 'cancelled' ? 'Đã huỷ' : status === 'pending' ? 'Chờ duyệt' : status === 'accepted' ? 'Đã nhận' : 'Bị từ chối'}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Quản lý công việc của bạn
          </p>
        </div>
        <Link
          to="/create-job"
          className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          <PlusCircle className="h-4 w-4" />
          Đăng việc mới
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <Briefcase className="mb-2 h-5 w-5 text-[var(--color-primary)]" />
          <p className="text-2xl font-bold">{myJobs.length}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">Việc đã đăng</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <Send className="mb-2 h-5 w-5 text-green-500" />
          <p className="text-2xl font-bold">{myApplications.length}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">Đã ứng tuyển</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <Clock className="mb-2 h-5 w-5 text-yellow-500" />
          <p className="text-2xl font-bold">{userProfile.activeJobCount}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">Đang thực hiện</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <CheckCircle className="mb-2 h-5 w-5 text-purple-500" />
          <p className="text-2xl font-bold">
            {myJobs.filter((j) => j.status === 'completed').length}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">Hoàn thành</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-[var(--color-border)]">
        <button
          onClick={() => setActiveTab('posted')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'posted'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Việc đã đăng ({myJobs.length})
        </button>
        <button
          onClick={() => setActiveTab('applied')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'applied'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
          }`}
        >
          <Send className="h-4 w-4" />
          Đã ứng tuyển ({myApplications.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[var(--color-border)] bg-white p-4">
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-1/3 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : activeTab === 'posted' ? (
        myJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
            <p className="font-medium">Bạn chưa đăng việc nào</p>
            <Link
              to="/create-job"
              className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
            >
              <PlusCircle className="h-4 w-4" /> Đăng việc đầu tiên
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myJobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white p-4 transition-colors hover:border-[var(--color-ring)] hover:bg-[var(--color-secondary)]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{job.title}</h3>
                    {statusBadge(job.status)}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {JOB_CATEGORIES.find((c) => c.value === job.category)?.label || 'Khác'} •{' '}
                    {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'} •{' '}
                    {job.applicants?.length || 0} ứng viên
                  </p>
                </div>
                <Eye className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              </Link>
            ))}
          </div>
        )
      ) : myApplications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center">
          <Send className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-medium">Bạn chưa ứng tuyển việc nào</p>
          <Link
            to="/jobs"
            className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
          >
            Khám phá việc làm →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {myApplications.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white p-4"
            >
              <div>
                <p className="font-medium">Job: {app.jobId}</p>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {app.message?.slice(0, 100)}
                </p>
              </div>
              {statusBadge(app.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
