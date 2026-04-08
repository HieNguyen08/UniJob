import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { Search, SlidersHorizontal, Zap, ArrowRight, Clock } from 'lucide-react';

import SuggestedJobs from '@/components/job/SuggestedJobs';
import { getJobs } from '@/services/job.service';
import type { Job } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useJobStore } from '@/store/jobStore';

export default function Home() {
  const navigate = useNavigate();
  const setFilters = useJobStore((s) => s.setFilters);

  const [search, setSearch] = useState('');
  const [urgentJobs, setUrgentJobs] = useState<Job[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchUrgent() {
      try {
        const jobs = await getJobs({ status: 'open', isUrgent: true, sortBy: 'newest' }, 3);
        if (!cancelled) setUrgentJobs(jobs);
      } catch (error) {
        console.error('Error fetching urgent jobs:', error);
      } finally {
        if (!cancelled) setUrgentLoading(false);
      }
    }

    fetchUrgent();
    return () => {
      cancelled = true;
    };
  }, []);

  const urgentSorted = useMemo(() => {
    // Prefer jobs with nearest deadline first.
    const copy = [...urgentJobs];
    copy.sort((a, b) => (a.deadline?.toMillis?.() ?? 0) - (b.deadline?.toMillis?.() ?? 0));
    return copy;
  }, [urgentJobs]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFilters({ searchQuery: search, isUrgent: undefined });
    navigate('/jobs');
  };

  const handleOpenFilters = () => {
    navigate('/jobs');
  };

  const handleViewAllUrgent = () => {
    setFilters({ isUrgent: true, searchQuery: '' });
    navigate('/jobs');
  };

  const formatRemaining = (deadline?: Timestamp): string => {
    if (!deadline) return 'Còn thời gian';
    const diffMs = deadline.toDate().getTime() - Date.now();
    if (diffMs <= 0) return 'Hết hạn';
    const totalMinutes = Math.floor(diffMs / 60_000);
    if (totalMinutes < 60) return `Còn ${totalMinutes} phút`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours < 24) {
      return minutes > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${hours} giờ`;
    }
    const days = Math.floor(hours / 24);
    return `Còn ${days} ngày`;
  };

  const paymentSuffix = (job: Job): string => {
    switch (job.paymentType) {
      case 'hourly':
        return '/giờ';
      case 'fixed':
        return '/task';
      case 'negotiable':
      case 'volunteer':
      default:
        return '';
    }
  };

  return (
    <div>
      {/* Hero: search */}
      <section className="bg-[linear-gradient(180deg,var(--color-home-hero)_0%,var(--color-secondary)_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <div className="text-center text-[var(--color-foreground)]">
            <h1 className="text-3xl font-bold md:text-4xl">Tìm công việc phù hợp với bạn</h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)] md:text-base">
              Khám phá hàng nghìn cơ hội việc làm từ sinh viên dành cho sinh viên
            </p>
          </div>

          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-7 flex max-w-3xl items-stretch gap-3"
          >
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 shadow-sm">
              <Search className="h-5 w-5 text-[var(--color-muted-foreground)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm công việc phù hợp..."
                className="h-14 w-full bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenFilters}
              className="inline-flex h-14 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-5 text-sm font-medium text-[var(--color-foreground)] shadow-sm hover:bg-white/95"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Bộ lọc
            </button>
          </form>
        </div>
      </section>

      {/* Urgent jobs */}
      <section className="bg-white py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--color-warning)]" />
              <h2 className="text-xl font-bold">Việc khẩn cấp cần người ngay</h2>
            </div>
            <button
              type="button"
              onClick={handleViewAllUrgent}
              className="text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Xem tất cả <span aria-hidden>›</span>
            </button>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {urgentLoading && (
              <div className="md:col-span-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-6 text-sm text-[var(--color-muted-foreground)]">
                Đang tải việc khẩn cấp...
              </div>
            )}

            {!urgentLoading && urgentSorted.length === 0 && (
              <div className="md:col-span-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-6 text-sm text-[var(--color-muted-foreground)]">
                Chưa có việc khẩn cấp nào.
              </div>
            )}

            {!urgentLoading &&
              urgentSorted.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-b from-orange-500 to-orange-600 p-6 text-white shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <div className="mb-4 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                    <Clock className="h-3.5 w-3.5" />
                    {formatRemaining(job.deadline)}
                  </div>

                  <h3 className="text-lg font-bold leading-snug">{job.title}</h3>
                  <p className="mt-1 text-xs text-white/80">{job.faculty}</p>

                  <div className="mt-5 text-xl font-extrabold">
                    {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
                    <span className="ml-1 text-sm font-semibold text-white/90">{paymentSuffix(job)}</span>
                  </div>

                  <div className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 transition-colors group-hover:bg-white/95">
                    Nhận ngay
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Suggested jobs (personalized) */}
      <SuggestedJobs />
    </div>
  );
}