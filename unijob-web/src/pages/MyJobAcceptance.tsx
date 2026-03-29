import { AlertTriangle, CheckCircle2, Clock3, Download, Phone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MyJobAcceptance() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm md:p-7">
        <h1 className="text-3xl font-bold text-slate-900">Xác nhận đã làm xong</h1>

        <section className="mt-5 rounded-2xl border border-[var(--color-border)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Hỗ trợ nhập liệu Excel luận văn</h2>
              <p className="mt-1 text-sm text-slate-500">Mã công việc: #JOB2026-1024</p>
            </div>
            <span className="rounded-full bg-orange-100 px-4 py-1 text-sm font-semibold text-orange-600">
              Chờ xác nhận nghiệm thu
            </span>
          </div>

          <div className="mt-6 grid grid-cols-4 items-center gap-2">
            <div className="h-1 rounded bg-green-500" />
            <div className="h-1 rounded bg-green-500" />
            <div className="h-1 rounded bg-orange-500" />
            <div className="h-1 rounded bg-slate-200" />
          </div>

          <div className="mt-3 grid gap-3 text-center md:grid-cols-4">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">Đã nhận việc</p>
              <p className="text-xs text-slate-500">10/02/2026</p>
            </div>
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">Sinh viên báo hoàn thành</p>
              <p className="text-xs text-slate-500">16/02/2026</p>
            </div>
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white">
                <Clock3 className="h-5 w-5" />
              </div>
              <p className="mt-2 text-xs font-semibold text-orange-600">Người đăng xác nhận</p>
              <p className="text-xs text-orange-500">Đang chờ bạn</p>
            </div>
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                4
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">Thanh toán & Đánh giá</p>
              <p className="text-xs text-slate-400">Chờ xử lý</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-base font-semibold text-slate-700">Kết quả công việc từ sinh viên</p>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200 text-green-700">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Nguyễn Văn An</p>
                <p className="text-sm text-slate-500">Em đã hoàn thành file dữ liệu, anh kiểm tra giúp em nhé.</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Ket_qua_final.xlsx</p>
                <p className="text-sm text-slate-500">2.4 MB</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                <Download className="h-4 w-4" />
                Tải xuống
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-semibold">Xác nhận nghiệm thu công việc</h3>
            </div>
            <p className="mt-1 text-sm text-amber-700">
              Vui lòng kiểm tra kỹ kết quả trước khi xác nhận. Sau khi xác nhận sẽ không được hoàn tác.
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              <button className="flex-1 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600">
                Xác nhận: Đã nhận kết quả
              </button>
              <button className="rounded-xl border border-red-400 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50">
                Báo cáo sự cố
              </button>
            </div>
            <p className="mt-2 text-center text-sm text-slate-500">
              Hệ thống sẽ chuyển tiền cho sinh viên và mở tính năng đánh giá
            </p>
          </div>

          <section className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs text-slate-500 md:text-sm">
            <p>
              Lưu ý: Để tránh tranh chấp, vui lòng kiểm tra kỹ file kết quả trước khi xác nhận. Mọi hành vi xác nhận không sẽ bị trừ điểm uy tín và có thể dẫn đến khóa tài khoản vĩnh viễn.
            </p>
            <div className="mt-4 grid gap-3 text-center md:grid-cols-3">
              <div>
                <p>Thù lao</p>
                <p className="text-sm font-semibold text-slate-700">500,000 VND</p>
              </div>
              <div>
                <p>Thời hạn</p>
                <p className="text-sm font-semibold text-slate-700">20/02/2026</p>
              </div>
              <div>
                <p>Sinh viên</p>
                <p className="text-sm font-semibold text-slate-700">Nguyễn Văn An</p>
              </div>
            </div>
          </section>
        </section>

        <button
          onClick={() => navigate('/my-jobs')}
          className="mt-6 inline-flex items-center gap-2 text-green-600 hover:text-green-700"
        >
          <Phone className="h-4 w-4" />
          Cần hỗ trợ? Liên hệ bộ phận hỗ trợ
        </button>
      </div>
    </div>
  );
}
