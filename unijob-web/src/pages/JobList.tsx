import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useJobStore } from '@/store/jobStore';
import { Search, Filter, Zap, MapPin, Clock, DollarSign } from 'lucide-react';
import { JOB_CATEGORIES, FACULTIES, PAYMENT_TYPES, SORT_OPTIONS } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useState } from 'react';

export default function JobList() {
  const { jobs, isLoading, filters, setFilters, resetFilters } = useJobStore();
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    useJobStore.getState().fetchJobs(true);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Tìm việc</h1>
        <p className="mt-1 text-[var(--color-muted-foreground)]">
          Khám phá các cơ hội công việc ngắn hạn trong campus
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên công việc, mô tả..."
            value={filters.searchQuery || ''}
            onChange={(e) => setFilters({ searchQuery: e.target.value })}
            className="w-full rounded-xl border border-[var(--color-border)] bg-white py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
            showFilters
              ? 'border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]'
              : 'border-[var(--color-border)] hover:bg-[var(--color-secondary)]'
          }`}
        >
          <Filter className="h-4 w-4" />
          Bộ lọc
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-6"
        >
          <div className="grid gap-4 md:grid-cols-4">
            {/* Category */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
                Danh mục
              </label>
              <select
                value={filters.category || ''}
                onChange={(e) => setFilters({ category: e.target.value || undefined })}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">Tất cả</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Faculty */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
                Khoa
              </label>
              <select
                value={filters.faculty || ''}
                onChange={(e) => setFilters({ faculty: e.target.value || undefined })}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">Tất cả</option>
                {FACULTIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
                Hình thức trả
              </label>
              <select
                value={filters.paymentType || ''}
                onChange={(e) => setFilters({ paymentType: (e.target.value || undefined) as never })}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">Tất cả</option>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
                Sắp xếp
              </label>
              <select
                value={filters.sortBy || 'newest'}
                onChange={(e) => setFilters({ sortBy: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilters({ isUrgent: true })}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filters.isUrgent
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Zap className="h-3 w-3" />
              Khẩn cấp
            </button>
            <button
              onClick={resetFilters}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              Xóa bộ lọc
            </button>
          </div>
        </motion.div>
      )}

      {/* Job Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[var(--color-border)] bg-white p-5">
              <div className="mb-3 h-4 w-3/4 rounded bg-gray-200" />
              <div className="mb-2 h-3 w-full rounded bg-gray-100" />
              <div className="mb-4 h-3 w-2/3 rounded bg-gray-100" />
              <div className="flex gap-2">
                <div className="h-6 w-16 rounded-full bg-gray-100" />
                <div className="h-6 w-20 rounded-full bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center">
          <Search className="mx-auto mb-4 h-12 w-12 text-[var(--color-muted-foreground)]" />
          <h3 className="text-lg font-medium">Không tìm thấy công việc</h3>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Thử thay đổi bộ lọc hoặc tìm kiếm với từ khóa khác
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                to={`/jobs/${job.id}`}
                className="group block rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]">
                      {job.title}
                    </h3>
                    {!job.isAnonymous && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        bởi {job.postedByName}
                      </p>
                    )}
                  </div>
                  {job.isUrgent && (
                    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      <Zap className="h-3 w-3" /> Khẩn
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="mb-4 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                  {job.description}
                </p>

                {/* Tags */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {job.category && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {JOB_CATEGORIES.find((c) => c.value === job.category)?.label || job.category}
                    </span>
                  )}
                  {job.faculty && (
                    <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      <MapPin className="h-3 w-3" />
                      {job.faculty}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                  <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <DollarSign className="h-4 w-4" />
                    {job.payment > 0 ? formatCurrency(job.payment) : 'Tình nguyện'}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                    <Clock className="h-3 w-3" />
                    {job.createdAt &&
                      formatDistanceToNow(job.createdAt.toDate(), {
                        addSuffix: true,
                        locale: vi,
                      })}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
