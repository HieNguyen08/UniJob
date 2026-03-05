import { Briefcase, Github } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-[var(--color-primary)]">
              <Briefcase className="h-5 w-5" />
              UniJob
            </Link>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Nền tảng kết nối công việc ngắn hạn dành riêng cho sinh viên đại học.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Liên kết</h3>
            <ul className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
              <li>
                <Link to="/jobs" className="hover:text-[var(--color-foreground)]">
                  Tìm việc
                </Link>
              </li>
              <li>
                <Link to="/create-job" className="hover:text-[var(--color-foreground)]">
                  Đăng việc
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-[var(--color-foreground)]">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Liên hệ</h3>
            <ul className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
              <li>📧 unijob@hcmut.edu.vn</li>
              <li>🏫 Trường Đại học Bách khoa TP.HCM</li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]"
                >
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--color-border)] pt-4 text-center text-xs text-[var(--color-muted-foreground)]">
          © 2026 UniJob — Electronic Commerce CO3027, HK252. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
