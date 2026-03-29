import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-6xl font-bold text-[var(--color-primary)]">404</h1>
      <p className="mb-6 text-lg text-[var(--color-muted-foreground)]">
        Trang bạn tìm kiếm không tồn tại
      </p>
      <Link
        to="/"
        className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 font-medium text-white transition-colors hover:opacity-90"
      >
        <Home className="h-5 w-5" />
        Về trang chủ
      </Link>
    </div>
  );
}
