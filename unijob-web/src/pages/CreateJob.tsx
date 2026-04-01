import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { createJob } from '@/services/job.service';
import { JOB_CATEGORIES, FACULTIES, PAYMENT_TYPES } from '@/lib/constants';
import { Timestamp } from 'firebase/firestore';
import { Zap, EyeOff, Send, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateJob() {
  const { userProfile } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    faculty: '',
    payment: 0,
    paymentType: 'fixed' as const,
    duration: '',
    deadline: '',
    maxApplicants: 1,
    isUrgent: false,
    isAnonymous: false,
    tags: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleToggle = (field: 'isUrgent' | 'isAnonymous') => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userProfile) {
      toast.error('Vui lòng đăng nhập');
      return;
    }

    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Vui lòng điền đầy đủ tiêu đề và mô tả');
      return;
    }

    setIsSubmitting(true);
    try {
      const jobId = await createJob({
        title: form.title,
        description: form.description,
        category: form.category,
        faculty: form.faculty || userProfile.faculty,
        payment: form.payment,
        paymentType: form.paymentType,
        duration: form.duration,
        deadline: form.deadline ? Timestamp.fromDate(new Date(form.deadline)) : Timestamp.now(),
        maxApplicants: form.maxApplicants,
        isUrgent: form.isUrgent,
        isAnonymous: form.isAnonymous,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        postedBy: userProfile.uid,
        postedByName: form.isAnonymous ? 'Ẩn danh' : userProfile.displayName,
        postedByPhoto: form.isAnonymous ? '' : userProfile.photoURL,
      });

      toast.success('Đăng việc thành công!');
      navigate(`/jobs/${jobId}`);
    } catch (error) {
      toast.error('Lỗi khi đăng việc');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </button>

      <h1 className="mb-2 text-2xl font-bold">Đăng công việc mới</h1>
      <p className="mb-8 text-sm text-[var(--color-muted-foreground)]">
        Điền thông tin bên dưới để đăng task lên UniJob
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Tiêu đề <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="VD: Tìm gia sư Toán Cao cấp A1"
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-ring)]"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Mô tả chi tiết <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Mô tả công việc, yêu cầu, địa điểm, thời gian..."
            rows={5}
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-ring)]"
            required
          />
        </div>

        {/* Category + Faculty */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Danh mục</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Chọn danh mục</option>
              {JOB_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Khoa liên quan</label>
            <select
              name="faculty"
              value={form.faculty}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Chọn khoa</option>
              {FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Mức trả (VNĐ)</label>
            <input
              type="number"
              name="payment"
              value={form.payment}
              onChange={handleChange}
              placeholder="0"
              min={0}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Hình thức trả</label>
            <select
              name="paymentType"
              value={form.paymentType}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              {PAYMENT_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Duration + Deadline + Max Applicants */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Thời gian làm</label>
            <input
              type="text"
              name="duration"
              value={form.duration}
              onChange={handleChange}
              placeholder="VD: 2 giờ, 1 tuần"
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Deadline</label>
            <input
              type="date"
              name="deadline"
              value={form.deadline}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Số người cần</label>
            <input
              type="number"
              name="maxApplicants"
              value={form.maxApplicants}
              onChange={handleChange}
              min={1}
              max={20}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">Tags</label>
          <input
            type="text"
            name="tags"
            value={form.tags}
            onChange={handleChange}
            placeholder="VD: toán, gia sư, online (phân cách bằng dấu phẩy)"
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleToggle('isUrgent')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              form.isUrgent
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-[var(--color-border)] hover:bg-[var(--color-secondary)]'
            }`}
          >
            <Zap className="h-4 w-4" />
            Việc khẩn cấp
          </button>
          <button
            type="button"
            onClick={() => handleToggle('isAnonymous')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              form.isAnonymous
                ? 'border-gray-400 bg-gray-100 text-gray-700'
                : 'border-[var(--color-border)] hover:bg-[var(--color-secondary)]'
            }`}
          >
            <EyeOff className="h-4 w-4" />
            Đăng ẩn danh
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-5 w-5" />
          {isSubmitting ? 'Đang đăng...' : 'Đăng công việc'}
        </button>
      </form>
    </div>
  );
}
