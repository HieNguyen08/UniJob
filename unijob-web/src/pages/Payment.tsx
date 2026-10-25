import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getPaymentForJob } from '@/services/payment.service';
import {
  DISPUTE_REASON_MAX,
  canDisputePayment,
  disputeErrorMessage,
  disputePayment,
  validateDisputeReason,
} from '@/services/dispute.service';
import toast from 'react-hot-toast';
import { getJobById } from '@/services/job.service';
import type { Payment } from '@/types';
import type { Job } from '@/types';
import {
  ArrowLeft,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Banknote,
  Receipt,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: ReactNode; description: string }> = {
  pending: {
    label: 'Chờ xử lý',
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    icon: <Clock className="h-5 w-5" />,
    description: 'Giao dịch đang được khởi tạo.',
  },
  held: {
    label: 'Đang ký quỹ',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: <ShieldCheck className="h-5 w-5" />,
    description: 'Tiền đang được giữ an toàn bởi nền tảng. Sẽ được giải phóng sau khi cả hai bên xác nhận hoàn thành.',
  },
  released: {
    label: 'Đã thanh toán',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: <CheckCircle2 className="h-5 w-5" />,
    description: 'Tiền đã được chuyển đến người thực hiện sau khi hoàn thành công việc.',
  },
  refunded: {
    label: 'Đã hoàn tiền',
    color: 'text-gray-600 bg-gray-50 border-gray-200',
    icon: <XCircle className="h-5 w-5" />,
    description: 'Tiền đã được hoàn trả lại cho người đăng việc.',
  },
  disputed: {
    label: 'Đang tranh chấp',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: <AlertTriangle className="h-5 w-5" />,
    description: 'Giao dịch đang được xem xét do có tranh chấp giữa hai bên.',
  },
};

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatTs(ts: { toDate?: () => Date; seconds?: number } | null | undefined): string {
  if (!ts) return '—';
  const date = ts?.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000);
  return format(date, 'HH:mm — dd/MM/yyyy', { locale: vi });
}

export default function Payment() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuthStore();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const uid = userProfile?.uid ?? '';
  const loadPayment = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoadError(false);
      const j = await getJobById(jobId);
      setJob(j);
      setPayment(j ? await getPaymentForJob(j, uid) : null);
    } catch {
      setPayment(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [jobId, uid]);

  useEffect(() => {
    void loadPayment();
  }, [loadPayment]);

  const reasonError = validateDisputeReason(reason);

  const handleDispute = async () => {
    if (!job || reasonError !== null) return;
    setSubmitting(true);
    try {
      await disputePayment(job.id, reason);
      toast.success('Đã gửi báo cáo tranh chấp. Bên kia sẽ được thông báo.');
      setShowDispute(false);
      setReason('');
      await loadPayment();
    } catch (err) {
      toast.error(disputeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted-foreground)]">Đang tải...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">Không tải được thông tin thanh toán.</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadPayment();
          }}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!payment || !job) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Banknote className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        <h2 className="mb-2 text-xl font-bold">Chưa có thông tin thanh toán</h2>
        <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
          Bản ghi ký quỹ sẽ được tạo khi công việc chuyển sang 'đang làm' (có thể mất vài giây).
        </p>
        <Link to={`/jobs/${jobId}`} className="text-sm text-[var(--color-primary)] hover:underline">
          ← Quay lại chi tiết công việc
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[payment.status] ?? STATUS_CONFIG.pending;
  const isPayer = userProfile?.uid === payment.payerId;
  const isPayee = userProfile?.uid === payment.payeeId;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chi tiết thanh toán</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Công việc:{' '}
          <Link to={`/jobs/${jobId}`} className="font-medium text-[var(--color-primary)] hover:underline">
            {job.title}
          </Link>
        </p>
      </div>

      {/* Status Card */}
      <div className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${statusInfo.color}`}>
        {statusInfo.icon}
        <div>
          <p className="font-semibold">{statusInfo.label}</p>
          <p className="mt-0.5 text-sm">{statusInfo.description}</p>
          {payment.status === 'disputed' && payment.disputeReason && (
            <p className="mt-1 text-sm">Lý do: {payment.disputeReason}</p>
          )}
        </div>
      </div>

      {/* Amount breakdown */}
      <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-white p-6">
        <div className="mb-4 flex items-center gap-2 text-[var(--color-muted-foreground)]">
          <Receipt className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase tracking-wide">Chi tiết giao dịch</span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-[var(--color-muted-foreground)]">Giá trị công việc</span>
            <span className="font-semibold">{formatVND(payment.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-[var(--color-muted-foreground)]">Phí nền tảng</span>
            <span className="text-sm font-medium text-red-500">−{formatVND(payment.platformFee)}</span>
          </div>
          <hr className="border-[var(--color-border)]" />
          <div className="flex justify-between">
            <span className="font-semibold">Người nhận thực nhận</span>
            <span className="text-lg font-bold text-[var(--color-primary)]">{formatVND(payment.netAmount)}</span>
          </div>
        </div>

        {payment.note && (
          <p className="mt-4 text-sm text-[var(--color-muted-foreground)] italic">Ghi chú: {payment.note}</p>
        )}
      </div>

      {/* Role info */}
      {(isPayer || isPayee) && (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            <span className="text-[var(--color-muted-foreground)]">
              {isPayer
                ? 'Bạn là người đăng việc (người trả tiền). Tiền được giữ trong hệ thống ký quỹ đến khi công việc hoàn thành.'
                : 'Bạn là người thực hiện (người nhận tiền). Tiền sẽ được chuyển sau khi cả hai bên xác nhận hoàn thành.'}
            </span>
          </div>
        </div>
      )}

      {canDisputePayment(payment, userProfile?.uid) && (
        <div className="mb-4">
          {!showDispute ? (
            <button
              type="button"
              onClick={() => setShowDispute(true)}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <AlertTriangle className="h-4 w-4" />
              Báo tranh chấp
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-white p-4">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={DISPUTE_REASON_MAX + 50}
                rows={4}
                placeholder="Mô tả vấn đề (10–500 ký tự)…"
                className="w-full rounded-lg border border-[var(--color-border)] p-3 text-sm"
              />
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-red-600">{reason !== '' && reasonError ? reasonError : ''}</span>
                <span className="text-[var(--color-muted-foreground)]">{Array.from(reason.trim()).length}/500</span>
              </div>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                Bên kia sẽ nhận được thông báo. Khoản ký quỹ sẽ được tạm giữ cho đến khi được xử lý.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDispute(false);
                    setReason('');
                  }}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={submitting || reasonError !== null}
                  onClick={() => void handleDispute()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Gửi báo cáo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {payment.source !== 'server' && (
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Bản ghi cũ, chưa được hệ thống xác nhận. Giao dịch tạo trước khi nâng cấp hệ thống — vui lòng liên hệ quản trị viên nếu có tranh chấp.
        </p>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
        <div className="mb-4 flex items-center gap-2 text-[var(--color-muted-foreground)]">
          <Clock className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase tracking-wide">Lịch sử giao dịch</span>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">Tạo giao dịch</span>
            <span>{formatTs(payment.createdAt)}</span>
          </div>
          {payment.heldAt && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Tiền ký quỹ</span>
              <span>{formatTs(payment.heldAt)}</span>
            </div>
          )}
          {payment.releasedAt && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Tiền giải ngân</span>
              <span className="text-green-600 font-medium">{formatTs(payment.releasedAt)}</span>
            </div>
          )}
          {payment.disputedAt && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Báo tranh chấp</span>
              <span>{formatTs(payment.disputedAt)}</span>
            </div>
          )}
          {payment.refundedAt && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Tiền hoàn trả</span>
              <span>{formatTs(payment.refundedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Escrow explanation */}
      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">🔒 Cơ chế Ký quỹ (Escrow)</p>
        <p>
          UniJob sử dụng hệ thống ký quỹ để bảo vệ cả hai bên. Sau khi người đăng chấp nhận ứng viên,
          tiền được giữ an toàn trong hệ thống. Khi cả hai bên xác nhận hoàn thành công việc, tiền
          sẽ tự động giải phóng cho người thực hiện (sau khi trừ phí nền tảng).
        </p>
      </div>
    </div>
  );
}
