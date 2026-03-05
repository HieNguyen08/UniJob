import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Briefcase, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await login();
      toast.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Đăng nhập thất bại';
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-lg"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white">
            <Briefcase className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Chào mừng đến UniJob</h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Đăng nhập bằng email trường để bắt đầu
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 font-medium shadow-sm transition-all hover:bg-gray-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
        </button>

        <div className="mt-6 text-center">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            <LogIn className="mr-1 inline h-3 w-3" />
            Chỉ hỗ trợ email @hcmut.edu.vn
          </p>
        </div>

        <div className="mt-6 rounded-xl bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-800">💡 Lưu ý</h3>
          <ul className="mt-2 space-y-1 text-xs text-blue-700">
            <li>• Sử dụng email do trường cung cấp</li>
            <li>• Thông tin cá nhân sẽ được bảo mật</li>
            <li>• Hoàn thành profile để bắt đầu nhận/đăng việc</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
