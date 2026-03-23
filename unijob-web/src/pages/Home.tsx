import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Briefcase, Search, Shield, Star, Zap, ArrowRight, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import SuggestedJobs from '@/components/job/SuggestedJobs';

export default function Home() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVHJhbnNmb3JtPSJyb3RhdGUoNDUpIj48cGF0aCBkPSJNLTEwIDMwaDYwdi0yMGgtNjB6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2EpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-50" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-sm">
              <Zap className="h-4 w-4 text-yellow-300" />
              Campus Marketplace cho sinh viên
            </div>
            <h1 className="text-4xl font-bold leading-tight md:text-6xl">
              Kết nối công việc
              <br />
              <span className="text-yellow-300">ngay trong campus</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100">
              UniJob giúp sinh viên, giảng viên và CLB dễ dàng đăng & tìm kiếm công việc
              ngắn hạn trong trường — nhanh chóng, minh bạch và uy tín.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/jobs"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 shadow-lg transition-transform hover:scale-105"
              >
                <Search className="h-5 w-5" />
                Tìm việc ngay
              </Link>
              {!isAuthenticated && (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                >
                  Bắt đầu miễn phí
                  <ArrowRight className="h-5 w-5" />
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-[var(--color-border)] bg-white py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 md:grid-cols-4">
          {[
            { icon: Briefcase, label: 'Việc đăng mỗi tuần', value: '50+' },
            { icon: Users, label: 'Sinh viên sử dụng', value: '500+' },
            { icon: Star, label: 'Rating trung bình', value: '4.5' },
            { icon: Clock, label: 'Thời gian match', value: '<2h' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <stat.icon className="mx-auto mb-2 h-6 w-6 text-[var(--color-primary)]" />
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Tại sao chọn <span className="text-[var(--color-primary)]">UniJob</span>?
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: 'Tìm kiếm thông minh',
                desc: 'Lọc theo khoa, loại việc, mức lương. Gợi ý job phù hợp dựa trên profile của bạn.',
              },
              {
                icon: Shield,
                title: 'An toàn & Uy tín',
                desc: 'Xác thực qua email trường, hệ thống đánh giá gamification, xác nhận hoàn thành 2 bước.',
              },
              {
                icon: Zap,
                title: 'Nhanh chóng',
                desc: 'Đăng việc khẩn cấp, match trong vòng 30 phút. Giao diện đơn giản, dễ sử dụng.',
              },
            ].map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ y: -4 }}
                className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[var(--color-primary)]">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[var(--color-secondary)] py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-12 text-center text-3xl font-bold">Cách hoạt động</h2>
          <div className="grid gap-8 md:grid-cols-4">
            {[
              { step: '1', title: 'Đăng nhập', desc: 'Sử dụng email trường để xác thực' },
              { step: '2', title: 'Đăng / Tìm việc', desc: 'Đăng task hoặc tìm việc phù hợp' },
              { step: '3', title: 'Thực hiện', desc: 'Nhận việc, hoàn thành và xác nhận' },
              { step: '4', title: 'Đánh giá', desc: 'Đánh giá lẫn nhau, tích lũy uy tín' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg font-bold text-white">
                  {item.step}
                </div>
                <h3 className="mb-1 font-semibold">{item.title}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Suggested Jobs (authenticated only) */}
      <SuggestedJobs />

      {/* CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">Sẵn sàng bắt đầu?</h2>
          <p className="mb-8 text-[var(--color-muted-foreground)]">
            Tham gia UniJob ngay hôm nay và khám phá hàng trăm cơ hội trong campus.
          </p>
          <Link
            to={isAuthenticated ? '/jobs' : '/login'}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 py-3 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-105"
          >
            {isAuthenticated ? 'Khám phá việc làm' : 'Đăng nhập ngay'}
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
