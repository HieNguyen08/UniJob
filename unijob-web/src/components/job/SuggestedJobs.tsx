import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobs, getApplicationsByUser } from '@/services/job.service';
import { getUserById } from '@/services/user.service';
import { getSuggestedJobs, type ScoredJob } from '@/services/suggest.service';
import type { Job } from '@/types';
import type { User } from '@/types/user';
import { MapPin, Star, Bookmark } from 'lucide-react';

export default function SuggestedJobs() {
  const { isAuthenticated, userProfile } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [subtitle, setSubtitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ratingByUserId, setRatingByUserId] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        // Personalized suggestions (if authenticated)
        if (isAuthenticated && userProfile) {
          const [user, allJobs, applications] = await Promise.all([
            getUserById(userProfile.uid),
            getJobs({ status: 'open' }, 60),
            getApplicationsByUser(userProfile.uid),
          ]);

          if (user) {
            const scored: ScoredJob[] = getSuggestedJobs(user as User, allJobs, applications);
            if (!cancelled && scored.length > 0) {
              setJobs(scored);
              setSubtitle('Dựa trên hồ sơ và sở thích của bạn');
              return;
            }
          }
        }

        // Fallback for guests or when we have no personalized data
        const recent = await getJobs({ status: 'open', sortBy: 'newest' }, 3);
        if (!cancelled) {
          setJobs(recent);
          setSubtitle(isAuthenticated ? 'Gợi ý dựa trên công việc mới nhất' : 'Công việc mới nhất dành cho bạn');
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        if (!cancelled) {
          setJobs([]);
          setSubtitle('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userProfile]);

  const visibleJobs = useMemo(() => jobs.slice(0, 3), [jobs]);

  const locationLabel = (job: Job): string => {
    switch (job.location) {
      case 'online':
        return 'Làm việc từ xa';
      case 'onsite':
      case 'offline':
        return 'Làm việc tại chỗ';
      default:
        return 'Linh hoạt';
    }
  };

  // Best-effort: show rating if the poster profile has it
  useEffect(() => {
    const ids = Array.from(new Set(visibleJobs.map((j) => j.postedBy).filter(Boolean)));
    const missing = ids.filter((id) => ratingByUserId[id] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        try {
          const user = await getUserById(id);
          const score = user?.ratingScore;
          return [id, typeof score === 'number' ? score : -1] as const;
        } catch {
          return [id, -1] as const;
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
  }, [ratingByUserId, visibleJobs]);

  return (
    <section className="py-12">
      <div className="mx-auto max-w-6xl px-4">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Đề xuất cho bạn</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>

        {/* Cards Grid - 3 columns matching Figma */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 sm:col-span-2 lg:col-span-3">
              Đang tải đề xuất...
            </div>
          )}

          {!loading && visibleJobs.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 sm:col-span-2 lg:col-span-3">
              Chưa có công việc nào để hiển thị.
            </div>
          )}

          {!loading &&
            visibleJobs.map((job) => {
              const rating = ratingByUserId[job.postedBy];
              const showRating = typeof rating === 'number' && rating >= 0;

              return (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="group rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              {/* Top row: title + bookmark */}
              <div className="mb-1 flex items-start justify-between">
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-emerald-600">
                  {job.title}
                </h3>
                <Bookmark className="h-5 w-5 flex-shrink-0 text-gray-300" />
              </div>

              {/* Organization / poster */}
              <p className="mb-3 text-sm text-gray-500">
                {job.isAnonymous ? 'Ẩn danh' : job.postedByName}
              </p>

              {/* Faculty badge */}
              {job.faculty && (
                <span className="mb-3 inline-block rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-foreground)]">
                  {job.faculty}
                </span>
              )}

              {/* Location */}
              <div className="mb-4 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                <span>{locationLabel(job)}</span>
              </div>

              {/* Bottom row: payment + rating */}
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">
                  {job.payment > 0
                    ? new Intl.NumberFormat('vi-VN').format(job.payment)
                    : 'Tình nguyện'}
                </span>
                {showRating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium text-gray-700">{rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">/5</span>
                  </div>
                )}
              </div>
            </Link>
              );
            })}
        </div>
      </div>
    </section>
  );
}
