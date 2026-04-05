import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Clock, Search, Star, X } from 'lucide-react';

import { useJobStore } from '@/store/jobStore';
import { FACULTIES, JOB_CATEGORIES, SORT_OPTIONS } from '@/lib/constants';
import { formatCurrency, truncateText } from '@/lib/utils';
import { getUserById } from '@/services/user.service';
import type { Job } from '@/types';

type TimeFilterKey = 'short' | 'day' | 'long';

function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return 'U';
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function parseDurationHours(duration: string): number | null {
  const text = duration.trim().toLowerCase();
  const m = text.match(/(\d+(?:[\.,]\d+)?)\s*(giờ|h)/);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function matchesTimeFilters(duration: string, selected: Record<TimeFilterKey, boolean>): boolean {
  if (!selected.short && !selected.day && !selected.long) return true;

  const text = duration.trim().toLowerCase();
  const hours = parseDurationHours(duration);

  const isShort = hours !== null ? hours <= 2 : text.includes('ngắn');
  const isDay = text.includes('ngày') || text.includes('trong ngày') || text.includes('hôm nay');
  const isLong = text.includes('tuần') || text.includes('tháng') || text.includes('project') || text.includes('dài');

  return (selected.short && isShort) || (selected.day && isDay) || (selected.long && isLong);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MIN_SALARY = 0;
const MAX_SALARY = 2_000_000;
const PAGE_SIZE = 6;

export default function JobList() {
  const jobs = useJobStore((s) => s.jobs);
  const isLoading = useJobStore((s) => s.isLoading);
  const filters = useJobStore((s) => s.filters);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const setFilters = useJobStore((s) => s.setFilters);
  const resetFilters = useJobStore((s) => s.resetFilters);

  const [search, setSearch] = useState(filters.searchQuery ?? '');
  const [sortBy, setSortBy] = useState(filters.sortBy ?? 'newest');

  // Sidebar draft
  const [salaryMinDraft, setSalaryMinDraft] = useState(50_000);
  const [salaryMaxDraft, setSalaryMaxDraft] = useState(500_000);
  const [timeDraft, setTimeDraft] = useState<Record<TimeFilterKey, boolean>>({
    short: false,
    day: false,
    long: false,
  });
  const [modeDraft, setModeDraft] = useState<'online' | 'offline' | ''>('');
  const [facultyDraft, setFacultyDraft] = useState<string>('');

  // Sidebar applied
  const [salaryMin, setSalaryMin] = useState<number>(MIN_SALARY);
  const [salaryMax, setSalaryMax] = useState<number>(MAX_SALARY);
  const [timeApplied, setTimeApplied] = useState<Record<TimeFilterKey, boolean>>({
    short: false,
    day: false,
    long: false,
  });
  const [modeApplied, setModeApplied] = useState<'online' | 'offline' | ''>('');

  const [page, setPage] = useState(1);
  const [ratingByUserId, setRatingByUserId] = useState<Record<string, number>>({});

  const updateSalaryMinDraft = (rawValue: number) => {
    const nextMin = clampNumber(rawValue, MIN_SALARY, MAX_SALARY);
    setSalaryMinDraft(nextMin);
    setSalaryMaxDraft((currentMax) => Math.max(currentMax, nextMin));
  };

  const updateSalaryMaxDraft = (rawValue: number) => {
    const nextMax = clampNumber(rawValue, MIN_SALARY, MAX_SALARY);
    setSalaryMaxDraft(nextMax);
    setSalaryMinDraft((currentMin) => Math.min(currentMin, nextMax));
  };

  useEffect(() => {
    fetchJobs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search apply
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters({ searchQuery: search });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search, setFilters]);

  // Sort apply immediately
  useEffect(() => {
    setFilters({ sortBy });
  }, [sortBy, setFilters]);

  const appliedChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (modeApplied) chips.push({ key: 'mode', label: modeApplied === 'online' ? 'Online' : 'Offline' });
    if (filters.faculty) chips.push({ key: 'faculty', label: filters.faculty });
    if (salaryMin !== MIN_SALARY || salaryMax !== MAX_SALARY) {
      chips.push({
        key: 'salary',
        label: `${new Intl.NumberFormat('vi-VN').format(salaryMin)}đ - ${new Intl.NumberFormat('vi-VN').format(
          salaryMax
        )}đ`,
      });
    }

    const timeLabels: string[] = [];
    if (timeApplied.short) timeLabels.push('Ngắn hạn');
    if (timeApplied.day) timeLabels.push('Trong ngày');
    if (timeApplied.long) timeLabels.push('Dài hạn');
    if (timeLabels.length > 0) chips.push({ key: 'time', label: timeLabels.join(', ') });
    return chips;
  }, [filters.faculty, modeApplied, salaryMax, salaryMin, timeApplied.day, timeApplied.long, timeApplied.short]);

  const filteredJobs = useMemo(() => {
    let list = jobs;

    // Salary filter (client-side) — only active when user applied a range
    if (salaryMin !== MIN_SALARY || salaryMax !== MAX_SALARY) {
      list = list.filter((job) => {
        const payment = job.payment ?? 0;
        return payment >= salaryMin && payment <= salaryMax;
      });
    }

    // Mode filter based on tags (client-side)
    if (modeApplied) {
      list = list.filter((job) => {
        const tags = (job.tags ?? []).map((t) => t.toLowerCase());
        return tags.includes(modeApplied);
      });
    }

    // Time filter (best-effort based on duration string)
    if (timeApplied.short || timeApplied.day || timeApplied.long) {
      list = list.filter((job) => matchesTimeFilters(job.duration || '', timeApplied));
    }

    return list;
  }, [jobs, modeApplied, salaryMax, salaryMin, timeApplied]);

  useEffect(() => {
    setPage(1);
  }, [filteredJobs.length]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));

  const pageItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => ({ type: 'page' as const, page: i + 1 }));
    }

    const pages = new Set<number>();
    pages.add(1);
    pages.add(totalPages);
    pages.add(page);
    pages.add(page - 1);
    pages.add(page + 1);

    const sorted = Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);

    const items: Array<
      | { type: 'page'; page: number }
      | { type: 'ellipsis'; key: string }
    > = [];

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const prev = sorted[i - 1];
      if (i > 0 && p - prev > 1) items.push({ type: 'ellipsis', key: `e-${prev}-${p}` });
      items.push({ type: 'page', page: p });
    }
    return items;
  }, [page, totalPages]);
  const pagedJobs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, page]);

  // Fetch poster ratings for currently visible cards (best-effort)
  useEffect(() => {
    const ids = Array.from(new Set(pagedJobs.map((j) => j.postedBy).filter(Boolean)));
    const missing = ids.filter((id) => ratingByUserId[id] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        try {
          const user = await getUserById(id);
          return [id, user?.ratingScore ?? 4.8] as const;
        } catch {
          return [id, 4.8] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setRatingByUserId((prev) => {
        const next = { ...prev };
        for (const [id, score] of pairs) next[id] = score;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pagedJobs, ratingByUserId]);

  const handleApplySidebar = () => {
    const minV = clampNumber(Math.min(salaryMinDraft, salaryMaxDraft), MIN_SALARY, MAX_SALARY);
    const maxV = clampNumber(Math.max(salaryMinDraft, salaryMaxDraft), MIN_SALARY, MAX_SALARY);

    setSalaryMin(minV);
    setSalaryMax(maxV);
    setTimeApplied(timeDraft);
    setModeApplied(modeDraft);

    // If we have client-side filters but no faculty (server-side) filter,
    // fetch more items initially to ensure the user sees results.
    const hasClientSideFilters =
      minV !== MIN_SALARY ||
      maxV !== MAX_SALARY ||
      timeDraft.short ||
      timeDraft.day ||
      timeDraft.long ||
      modeDraft !== '';

    const fetchLimit = !facultyDraft && hasClientSideFilters ? 60 : undefined;

    setFilters({
      faculty: facultyDraft || undefined,
    });

    // Directly trigger fetch with limit if needed
    if (fetchLimit) {
      fetchJobs(true, fetchLimit);
    }
  };

  const handleClearAll = () => {
    setSearch('');
    setSortBy('newest');
    setSalaryMinDraft(50_000);
    setSalaryMaxDraft(500_000);
    setTimeDraft({ short: false, day: false, long: false });
    setModeDraft('');
    setFacultyDraft('');

    setSalaryMin(MIN_SALARY);
    setSalaryMax(MAX_SALARY);
    setTimeApplied({ short: false, day: false, long: false });
    setModeApplied('');

    resetFilters();
  };

  const handleRemoveChip = (key: string) => {
    switch (key) {
      case 'mode':
        setModeDraft('');
        setModeApplied('');
        break;
      case 'faculty':
        setFacultyDraft('');
        setFilters({ faculty: undefined });
        break;
      case 'salary':
        setSalaryMinDraft(50_000);
        setSalaryMaxDraft(500_000);
        setSalaryMin(MIN_SALARY);
        setSalaryMax(MAX_SALARY);
        break;
      case 'time':
        setTimeDraft({ short: false, day: false, long: false });
        setTimeApplied({ short: false, day: false, long: false });
        break;
    }
  };

  return (
    <div className="bg-[var(--color-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Link to="/" className="hover:text-[var(--color-foreground)]">
            Trang chủ
          </Link>
          <span>/</span>
          <span className="text-[var(--color-foreground)]">Việc làm</span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="h-fit rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">Bộ lọc tìm kiếm</h2>

            {/* Salary */}
            <div className="border-b border-[var(--color-border)] pb-4">
              <h3 className="mb-3 text-sm font-semibold">Mức lương</h3>
              <div className="relative mb-3 h-4">
                <input
                  aria-label="Lương tối thiểu"
                  className="joblist-range absolute inset-x-0 top-1/2 w-full -translate-y-1/2"
                  type="range"
                  min={MIN_SALARY}
                  max={salaryMaxDraft}
                  step={10_000}
                  value={salaryMinDraft}
                  onChange={(e) => updateSalaryMinDraft(Number(e.target.value))}
                />
                <input
                  aria-label="Lương tối đa"
                  className="joblist-range absolute inset-x-0 top-1/2 w-full -translate-y-1/2"
                  type="range"
                  min={salaryMinDraft}
                  max={MAX_SALARY}
                  step={10_000}
                  value={salaryMaxDraft}
                  onChange={(e) => updateSalaryMaxDraft(Number(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs text-[var(--color-muted-foreground)]">Tối thiểu</div>
                  <input
                    type="number"
                    min={MIN_SALARY}
                    max={salaryMaxDraft}
                    step={10_000}
                    value={salaryMinDraft}
                    onChange={(e) => updateSalaryMinDraft(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-[var(--color-muted-foreground)]">Tối đa</div>
                  <input
                    type="number"
                    min={salaryMinDraft}
                    max={MAX_SALARY}
                    step={10_000}
                    value={salaryMaxDraft}
                    onChange={(e) => updateSalaryMaxDraft(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Time */}
            <div className="border-b border-[var(--color-border)] py-4">
              <h3 className="mb-3 text-sm font-semibold">Thời gian</h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={timeDraft.short}
                    onChange={(e) => setTimeDraft((p) => ({ ...p, short: e.target.checked }))}
                  />
                  <span>Ngắn hạn (&lt; 2 giờ)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={timeDraft.day}
                    onChange={(e) => setTimeDraft((p) => ({ ...p, day: e.target.checked }))}
                  />
                  <span>Trong ngày</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={timeDraft.long}
                    onChange={(e) => setTimeDraft((p) => ({ ...p, long: e.target.checked }))}
                  />
                  <span>Dài hạn (Project)</span>
                </label>
              </div>
            </div>

            {/* Mode */}
            <div className="border-b border-[var(--color-border)] py-4">
              <h3 className="mb-3 text-sm font-semibold">Hình thức</h3>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 rounded-xl bg-[var(--color-secondary)] p-1">
                  <button
                    type="button"
                    onClick={() => setModeDraft(modeDraft === 'online' ? '' : 'online')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      modeDraft === 'online'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-white text-[var(--color-muted-foreground)] shadow-sm'
                    }`}
                  >
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeDraft(modeDraft === 'offline' ? '' : 'offline')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      modeDraft === 'offline'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-white text-[var(--color-muted-foreground)] shadow-sm'
                    }`}
                  >
                    Offline
                  </button>
                </div>
                {modeDraft !== '' && (
                  <button
                    type="button"
                    onClick={() => setModeDraft('')}
                    className="text-center text-xs text-[var(--color-primary)] hover:underline"
                  >
                    Tất cả hình thức
                  </button>
                )}
              </div>
            </div>

            {/* Faculty */}
            <div className="py-4">
              <h3 className="mb-3 text-sm font-semibold">Khoa/Ngành</h3>
              <div className="relative">
                <select
                  value={facultyDraft}
                  onChange={(e) => setFacultyDraft(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">Chọn khoa...</option>
                  {FACULTIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplySidebar}
              className="mt-2 w-full rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Áp dụng
            </button>
          </aside>

          {/* Main */}
          <section>
            {/* Search + Sort */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên việc..."
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div className="relative w-full sm:w-64">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              </div>
            </div>

            {/* Category chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilters({ category: undefined })}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  !filters.category
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
              >
                Tất cả
              </button>
              {JOB_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() =>
                    setFilters({ category: filters.category === cat.value ? undefined : cat.value })
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filters.category === cat.value
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-white border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Applied filters */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[var(--color-muted-foreground)]">Bộ lọc đang áp dụng:</span>
                {appliedChips.map((chip) => (
                  <button
                    type="button"
                    key={chip.key}
                    onClick={() => handleRemoveChip(chip.key)}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    {chip.label}
                    <span className="text-white/80">×</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-sm text-[var(--color-primary)] hover:underline"
                >
                  Xóa tất cả
                </button>
              </div>
            </div>

            <div className="mt-4 text-sm text-[var(--color-muted-foreground)]">
              {isLoading ? 'Đang tải...' : `Tìm thấy ${filteredJobs.length} công việc`}
            </div>

            {/* Cards */}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {pagedJobs.map((job) => (
                <JobCard key={job.id} job={job} rating={ratingByUserId[job.postedBy]} />
              ))}
              {!isLoading && pagedJobs.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
                  <Search className="mx-auto mb-3 h-10 w-10 opacity-20" />
                  <p className="font-medium">Không có công việc phù hợp</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Thử điều chỉnh bộ lọc hoặc xem tất cả danh mục</p>
                  <button
                    onClick={handleClearAll}
                    className="mt-4 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-secondary)]"
                  >
                    <X className="h-3.5 w-3.5" /> Xóa bộ lọc
                  </button>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm disabled:opacity-50"
              >
                Trước
              </button>
              {pageItems.map((item) => {
                if (item.type === 'ellipsis') {
                  return (
                    <span
                      key={item.key}
                      className="px-2 text-sm text-[var(--color-muted-foreground)]"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  );
                }

                const p = item.page;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`h-9 w-9 rounded-xl border text-sm ${
                      page === p
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] bg-white'
                    }`}
                    aria-current={page === p ? 'page' : undefined}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, rating }: { job: Job; rating?: number }) {
  const displayName = job.isAnonymous ? 'Ẩn danh' : job.postedByName;
  const score = rating ?? 4.8;

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="rounded-2xl border border-[var(--color-border)] bg-white p-5 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          {truncateText(job.title, 52)}
        </h3>
        {job.isUrgent && (
          <span className="rounded-full bg-[var(--color-warning)] px-2.5 py-1 text-[10px] font-semibold text-white">
            Gấp
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {job.duration || 'Linh hoạt'}
        </span>
        <span className="font-semibold text-[var(--color-urgent)]">
          {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.postedByPhoto && !job.isAnonymous ? (
            <img
              src={job.postedByPhoto}
              alt={displayName}
              className="h-8 w-8 rounded-full"
              loading="lazy"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-[var(--color-muted-foreground)]">
              {job.isAnonymous ? '?' : getInitials(displayName)}
            </div>
          )}
          <div className="text-xs">
            <div className="max-w-[160px] truncate text-[var(--color-foreground)]">{displayName}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <Star className="h-4 w-4 fill-[var(--color-warning)] text-[var(--color-warning)]" />
          <span className="font-semibold text-[var(--color-foreground)]">{score.toFixed(1)}</span>
        </div>
      </div>
    </Link>
  );
}