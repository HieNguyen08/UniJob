import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { createJob } from '@/services/job.service';
import { JOB_CATEGORIES, FACULTIES } from '@/lib/constants';
import { Timestamp } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Lightbulb } from 'lucide-react';
import type { JobLocation } from '@/types/job';
import toast from 'react-hot-toast';

const LOCATION_OPTIONS: { value: JobLocation; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'onsite', label: 'Tại trường' },
];

const TIPS = [
  'Tiêu đề rõ ràng giúp tăng 3x lượt ứng tuyển',
  'Mô tả chi tiết yêu cầu kỹ năng và thời gian',
  'Đặt mức thù lao hợp lý để thu hút sinh viên giỏi',
  'Kiểm tra lại thông tin trước khi đăng',
];

export default function CreateJob() {
  const { userProfile } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    faculty: '',
    location: 'online' as JobLocation,
    payment: 0,
    paymentType: 'fixed' as const,
    isVolunteer: false,
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

  const handleSubmit = async (e: React.FormEvent, isDraft = false) => {
    e.preventDefault();
    if (!userProfile) { toast.error('Vui lòng đăng nhập'); return; }
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Vui lòng điền đầy đủ tiêu đề và mô tả');
      return;
    }

    setIsSubmitting(true);
    try {
      const jobId = await createJob({
        title: form.title,
        description: form.description,
        category: form.category || 'other',
        faculty: form.faculty || userProfile.faculty,
        location: form.location,
        payment: form.isVolunteer ? 0 : form.payment,
        paymentType: form.isVolunteer ? 'volunteer' : form.paymentType,
        duration: form.duration,
        deadline: form.deadline ? Timestamp.fromDate(new Date(form.deadline)) : Timestamp.now(),
        maxApplicants: form.maxApplicants,
        isUrgent: form.isUrgent,
        isAnonymous: form.isAnonymous,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        postedBy: userProfile.uid,
        postedByName: form.isAnonymous ? 'Ẩn danh' : userProfile.displayName,
        postedByPhoto: form.isAnonymous ? '' : userProfile.photoURL,
      });

      if (isDraft) {
        toast.success('Đã lưu nháp!');
        navigate('/dashboard');
      } else {
        toast.success('Đăng việc thành công!');
        navigate(`/jobs/${jobId}`);
      }
    } catch (error) {
      toast.error('Lỗi khi đăng việc');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </button>

      <h1 className="mb-1 text-2xl font-bold">Đăng công việc mới</h1>
      <p className="mb-8 text-sm text-[var(--color-muted-foreground)]">
        Tìm kiếm sinh viên phù hợp cho dự án của bạn
      </p>

      <form onSubmit={(e) => handleSubmit(e, false)}>
        <div className="grid gap-8 lg:grid-cols-3">

          {/* ── LEFT COLUMN ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Thông tin cơ bản */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-800">Thông tin cơ bản</h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Tiêu đề công việc <span className="text-red-500">*</span>
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

                <div className="grid gap-4 sm:grid-cols-2">
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
                    <label className="mb-1.5 block text-sm font-medium">Khoa / Ngành</label>
                    <select
                      name="faculty"
                      value={form.faculty}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                    >
                      <option value="">Chọn khoa</option>
                      {FACULTIES.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Hình thức công việc */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-800">Hình thức công việc</h2>
              <div className="flex flex-wrap gap-3">
                {LOCATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${
                      form.location === opt.value
                        ? 'border-[var(--color-primary)] bg-emerald-50 text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="location"
                      value={opt.value}
                      checked={form.location === opt.value}
                      onChange={handleChange}
                      className="hidden"
                    />
                    {form.location === opt.value && (
                      <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                    )}
                    {opt.label}
                  </label>
                ))}
              </div>
            </section>

            {/* Chi tiết công việc */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-800">Chi tiết công việc</h2>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Mô tả <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Mô tả công việc, yêu cầu kỹ năng, địa điểm, thời gian cụ thể..."
                  rows={6}
                  className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-ring)]"
                  required
                />
              </div>
              <div className="mt-4">
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
            </section>

            {/* Ngân sách & Thời gian */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-800">Ngân sách & Thời gian</h2>

              {/* Volunteer toggle */}
              <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Tình nguyện (không lương)</p>
                  <p className="text-xs text-gray-500">Bật nếu đây là công việc tình nguyện</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, isVolunteer: !prev.isVolunteer }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    form.isVolunteer ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.isVolunteer ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {!form.isVolunteer && (
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Mức thù lao (VNĐ)</label>
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
                      <option value="fixed">Trả cố định</option>
                      <option value="hourly">Theo giờ</option>
                      <option value="negotiable">Thỏa thuận</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
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
                  <label className="mb-1.5 block text-sm font-medium">Hạn chót</label>
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
            </section>

            {/* Cài đặt nâng cao */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-800">Cài đặt nâng cao</h2>
              <div className="space-y-4">
                {/* Urgent */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Việc khẩn cấp</p>
                    <p className="text-xs text-gray-500">Hiển thị badge nổi bật, ưu tiên đầu danh sách</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, isUrgent: !prev.isUrgent }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      form.isUrgent ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        form.isUrgent ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Anonymous */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Đăng ẩn danh</p>
                    <p className="text-xs text-gray-500">Tên của bạn sẽ không hiển thị với ứng viên</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, isAnonymous: !prev.isAnonymous }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      form.isAnonymous ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        form.isAnonymous ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* Submit buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Đang đăng...' : 'Đăng việc'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
                className="rounded-xl border border-[var(--color-border)] px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Lưu Nháp
              </button>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="space-y-4">
            {/* Tips */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <h3 className="font-semibold text-gray-800">Mẹo đăng hiệu quả</h3>
              </div>
              <ul className="space-y-3">
                {TIPS.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-sm text-gray-600">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Preview card */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
              <h3 className="mb-3 font-semibold text-gray-800">Xem trước</h3>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="mb-1 text-sm font-medium text-gray-800 line-clamp-2">
                  {form.title || 'Tiêu đề công việc'}
                </p>
                <p className="mb-2 text-xs text-gray-500 line-clamp-2">
                  {form.description || 'Mô tả công việc...'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {form.isUrgent && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      Khẩn
                    </span>
                  )}
                  {form.isVolunteer ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                      Tình nguyện
                    </span>
                  ) : form.payment > 0 ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                      {new Intl.NumberFormat('vi-VN').format(form.payment)}đ
                    </span>
                  ) : null}
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600">
                    {LOCATION_OPTIONS.find((o) => o.value === form.location)?.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
