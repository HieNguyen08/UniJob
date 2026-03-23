import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getJobs, getApplicationsByUser } from '@/services/job.service';
import { getUserById } from '@/services/user.service';
import { getSuggestedJobs, type ScoredJob } from '@/services/suggest.service';
import type { User } from '@/types/user';
import { MapPin, Star, Bookmark } from 'lucide-react';

export default function SuggestedJobs() {
  const { isAuthenticated, userProfile } = useAuthStore();
  const [suggestions, setSuggestions] = useState<ScoredJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !userProfile) {
      setLoading(false);
      return;
    }

    async function fetchSuggestions() {
      try {
        const [user, allJobs, applications] = await Promise.all([
          getUserById(userProfile!.uid),
          getJobs({ status: 'open' }),
          getApplicationsByUser(userProfile!.uid),
        ]);

        if (user) {
          const scored = getSuggestedJobs(user as User, allJobs, applications);
          setSuggestions(scored);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSuggestions();
  }, [isAuthenticated, userProfile]);

  if (!isAuthenticated || loading) return null;
  if (suggestions.length === 0) return null;

  return (
    <section className="py-12">
      <div className="mx-auto max-w-6xl px-4">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Đề xuất cho bạn</h2>
          <p className="mt-1 text-sm text-gray-500">
            Dựa trên hồ sơ và sở thích của bạn
          </p>
        </div>

        {/* Cards Grid - 3 columns matching Figma */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((job) => (
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
                <span className="mb-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {job.faculty}
                </span>
              )}

              {/* Location */}
              <div className="mb-4 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                <span>Làm việc từ xa</span>
              </div>

              {/* Bottom row: payment + rating */}
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">
                  {job.payment > 0
                    ? new Intl.NumberFormat('vi-VN').format(job.payment)
                    : 'Tình nguyện'}
                </span>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium text-gray-700">4.9</span>
                  <span className="text-xs text-gray-400">/5</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
