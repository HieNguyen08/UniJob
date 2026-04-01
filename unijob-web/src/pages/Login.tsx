import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Briefcase, ChevronLeft, LogIn, Mail, UserCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useMemo, useState } from 'react';

type LoginStep = 'welcome' | 'choose-account' | 'email';

const MOCK_ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'Account Name 01',
    email: 'nguyenvana01@hcmut.edu.vn',
  },
  {
    id: 'acc-2',
    name: 'Account Name 02',
    email: 'nguyenvana02@hcmut.edu.vn',
  },
];

export default function Login() {
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const hintText = useMemo(() => {
    if (step === 'choose-account') return 'Vui lòng chọn một tài khoản để tiếp tục.';
    if (step === 'email') return 'Vui lòng đăng nhập để tiếp tục.';
    return 'Vui lòng đăng nhập để tiếp tục.';
  }, [step]);

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

  const handleContinueWithGoogle = () => {
    setStep('choose-account');
  };

  const handleEmailSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password) {
      toast.error('Vui lòng nhập email và mật khẩu');
      return;
    }

    if (!email.endsWith('@hcmut.edu.vn')) {
      toast.error('Chỉ hỗ trợ email @hcmut.edu.vn');
      return;
    }

    // App currently authenticates with Google popup.
    handleLogin();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dfe5f0] bg-white shadow-[0_20px_60px_rgba(31,48,87,0.12)] md:grid-cols-[1.1fr_1fr]"
      >
        <div className="relative min-h-[280px] bg-slate-800 md:min-h-[560px]">
          <img
            src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1400&q=80"
            alt="University campus"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10203f]/70 via-[#0d1f47]/35 to-transparent" />

          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white sm:p-8">
            <div>
              <h2 className="text-3xl font-bold leading-tight">Kết nối việc làm Sinh viên</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-white/85">
                Nền tảng uy tín dành cho sinh viên Bách Khoa và doanh nghiệp.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                  <Briefcase className="h-5 w-5" />
                </div>
                
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Chào mừng trở lại!</h1>
              <p className="mt-1 text-xs text-slate-500">{hintText}</p>
            </div>

            {step === 'welcome' && (
              <div>
                <button
                  onClick={handleContinueWithGoogle}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập bằng email trường'}
                </button>

                <button
                  onClick={() => setStep('email')}
                  className="mt-6 w-full rounded-lg border border-[#d7ddea] bg-white px-4 py-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Dùng email và mật khẩu
                </button>

                <p className="mt-6 text-center text-[11px] text-slate-400">
                  Chỉ hỗ trợ email @hcmut.edu.vn
                </p>
              </div>
            )}

            {step === 'choose-account' && (
              <div>
                <div className="space-y-2">
                  {MOCK_ACCOUNTS.map((account) => (
                    <button
                      key={account.id}
                      onClick={handleLogin}
                      disabled={isLoading}
                      className="flex w-full items-center gap-3 rounded-lg border border-[#e5e9f2] px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      <UserCircle2 className="h-5 w-5 text-violet-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{account.name}</p>
                        <p className="text-xs text-slate-500">{account.email}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setStep('email')}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#d7ddea] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Mail className="h-4 w-4" />
                  Use another account
                </button>

                <button
                  onClick={() => setStep('welcome')}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Quay lại
                </button>
              </div>
            )}

            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-md border border-[#cfd6e4] px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full rounded-md border border-[#cfd6e4] px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500"
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 w-full rounded-full bg-black px-4 py-2 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'SIGN IN...' : 'SIGN IN'}
                </button>

                <p className="text-center text-[11px] text-slate-400">
                  Bấm SIGN IN sẽ mở đăng nhập Google của Firebase
                </p>

                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="mx-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
