import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Clock, Star } from 'lucide-react';

import { getJobs } from '@/services/job.service';
import { useJobStore } from '@/store/jobStore';
import { JOB_CATEGORIES } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import type { Job } from '@/types';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export default function JobSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setFilters = useJobStore((s) => s.setFilters);

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [mode, setMode] = useState<'online' | 'offline' | ''>('');
  const [category, setCategory] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getJobs({ status: 'open', sortBy: 'newest' }, 100)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, []);

  const filteredJobs = useMemo(() => {
    let list = jobs;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q) ||
          j.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (category) {
      list = list.filter((j) => j.category === category);
    }

    if (mode) {
      list = list.filter((j) =>
        (j.tags ?? []).map((t) => t.toLowerCase()).includes(mode)
      );
    }

    return list;
  }, [jobs, search, category, mode]);

  const handleApply = () => {
    setFilters({
      searchQuery: search.trim() || undefined,
      category: category || undefined,
    });
    navigate('/jobs');
  };

  const selectedCat = JOB_CATEGORIES.find((c) => c.value === category);
  const hasFilter = !!category || !!mode || !!search.trim();

  return (
    <div className="min-h-screen bg-[var(--color-secondary)]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          Tìm công việc phù hợp với bạn
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Khám phá hàng nghìn cơ hội việc làm từ sinh viên dành cho sinh viên
        </p>

        {/* Search bar */}
        <div className="mt-5 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="Tìm kiếm công việc..."
              className="h-12 w-full bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
            />
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-2xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            Áp dụng
          </button>
        </div>

        {/* Filter row */}
        <div className="relative mt-3 flex items-center gap-2">
          {/* Bộ lọc (category) */}
          <button
            type="button"
            onClick={() => setShowCategoryMenu((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition-colors ${
              category
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {selectedCat ? `${selectedCat.icon} ${selectedCat.label}` : 'Bộ lọc'}
          </button>

          {/* Category dropdown */}
          {showCategoryMenu && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl border border-[var(--color-border)] bg-white py-1 shadow-xl">
              <button
                type="button"
                onClick={() => { setCategory(''); setShowCategoryMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--color-secondary)]"
              >
                Tất cả danh mục
              </button>
              {JOB_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCategory(c.value); setShowCategoryMenu(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--color-secondary)] ${
                    category === c.value ? 'font-semibold text-[var(--color-primary)]' : ''
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Áp dụng */}
          <button
            type="button"
            onClick={handleApply}
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Áp dụng
          </button>

          {/* Clear */}
          {hasFilter && (
            <button
              type="button"
              onClick={() => { setSearch(''); setCategory(''); setMode(''); }}
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Xóa lọc
            </button>
          )}

          {/* Online / Offline toggle */}
          <div className="ml-auto flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
            <button
              type="button"
              onClick={() => setMode(mode === 'online' ? '' : 'online')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                mode === 'online'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:bg-gray-50'
              }`}
            >
              Online
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'offline' ? '' : 'offline')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                mode === 'offline'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:bg-gray-50'
              }`}
            >
              Offline
            </button>
          </div>
        </div>

        {/* Result count */}
        <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
          {loading ? 'Đang tải...' : `Tìm thấy ${filteredJobs.length} công việc`}
        </p>

        {/* Job cards */}
        <div className="mt-3 space-y-3">
          {!loading && filteredJobs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              <Search className="mx-auto mb-2 h-8 w-8 opacity-20" />
              Không tìm thấy công việc phù hợp
            </div>
          )}

          {!loading &&
            filteredJobs.map((job) => <JobSearchCard key={job.id} job={job} />)}
        </div>
      </div>
    </div>
  );
}

function JobSearchCard({ job }: { job: Job }) {
  const displayName = job.isAnonymous ? 'Ẩn danh' : (job.postedByName ?? '');

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 transition-shadow hover:shadow-sm"
    >
      {/* Avatar */}
      <div className="shrink-0">
        {job.postedByPhoto && !job.isAnonymous ? (
          <img
            src={job.postedByPhoto}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-[var(--color-muted-foreground)]">
            {job.isAnonymous ? '?' : getInitials(displayName)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-[var(--color-foreground)]">
            {job.title}
          </h3>
          {job.isUrgent && (
            <span className="shrink-0 rounded-full bg-[var(--color-warning)] px-2.5 py-0.5 text-[10px] font-semibold text-white">
              Gấp
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {job.duration || 'Linh hoạt'}
          </span>
          <span className="font-semibold text-[var(--color-urgent)]">
            {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
          </span>
          {job.faculty && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {job.faculty}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[var(--color-muted-foreground)]">{displayName}</span>
          <div className="flex items-center gap-1 text-xs">
            <Star className="h-3.5 w-3.5 fill-[var(--color-warning)] text-[var(--color-warning)]" />
            <span className="font-medium text-[var(--color-foreground)]">4.8</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
