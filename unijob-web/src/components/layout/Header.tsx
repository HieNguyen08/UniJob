import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import {
  Briefcase,
  LogIn,
  LogOut,
  User,
  PlusCircle,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function Header() {
  const { isAuthenticated, userProfile, login, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = async () => {
    try {
      await login();
      navigate('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setMobileMenuOpen(false);
      toast.success('Đăng xuất thành công');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Đăng xuất thất bại');
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-[var(--color-primary)]">
          <Briefcase className="h-6 w-6" />
          <span>UniJob</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            to="/jobs"
            className="text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
          >
            Tìm việc
          </Link>

          {isAuthenticated && (
            <>
              <Link
                to="/create-job"
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              >
                <PlusCircle className="h-4 w-4" />
                Đăng việc
              </Link>
              <Link
                to="/dashboard"
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </>
          )}
        </nav>

        {/* Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated && userProfile ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-secondary)]"
              >
                {userProfile.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
                <span className="max-w-[120px] truncate">{userProfile.displayName}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              Đăng nhập
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-[var(--color-border)] bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link
              to="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-secondary)]"
            >
              Tìm việc
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  to="/create-job"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-secondary)]"
                >
                  Đăng việc
                </Link>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-secondary)]"
                >
                  Dashboard
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-secondary)]"
                >
                  Hồ sơ
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-500 hover:bg-red-50"
                >
                  Đăng xuất
                </button>
              </>
            )}
            {!isAuthenticated && (
              <button
                onClick={() => {
                  handleLogin();
                  setMobileMenuOpen(false);
                }}
                className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white"
              >
                Đăng nhập bằng Google
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
