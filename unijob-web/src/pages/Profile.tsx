import { useAuthStore } from '@/store/authStore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateUserProfile } from '@/services/user.service';
import { FACULTIES } from '@/lib/constants';
import { Star, Briefcase, Mail, Phone, BookOpen, Award, Save, Edit3, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Profile() {
  const navigate = useNavigate();
  const { userProfile, refreshProfile } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: userProfile?.displayName || '',
    faculty: userProfile?.faculty || '',
    department: userProfile?.department || '',
    studentId: userProfile?.studentId || '',
    phone: userProfile?.phone || '',
    bio: userProfile?.bio || '',
    skills: userProfile?.skills?.join(', ') || '',
  });

  if (!userProfile) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--color-muted-foreground)]">Vui lòng đăng nhập</p>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await updateUserProfile(userProfile.uid, {
        displayName: form.displayName,
        faculty: form.faculty,
        department: form.department,
        studentId: form.studentId,
        phone: form.phone,
        bio: form.bio,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await refreshProfile();
      setIsEditing(false);
      toast.success('Cập nhật profile thành công!');
    } catch (error) {
      toast.error('Lỗi khi cập nhật');
      console.error(error);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center lg:col-span-1">
          <div className="mb-4">
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="mx-auto h-24 w-24 rounded-full border-4 border-blue-100"
              />
            ) : (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-primary)] text-3xl font-bold text-white">
                {userProfile.displayName?.charAt(0) || '?'}
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold">{userProfile.displayName}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{userProfile.email}</p>

          {/* Rating */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            <span className="text-lg font-bold">
              {userProfile.ratingScore > 0 ? userProfile.ratingScore.toFixed(1) : 'Mới'}
            </span>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              ({userProfile.totalRatings} đánh giá)
            </span>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-4">
            <div>
              <p className="text-2xl font-bold text-[var(--color-primary)]">
                {userProfile.activeJobCount}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">Job đang nhận</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--color-primary)]">
                {userProfile.maxJobLimit}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">Giới hạn</p>
            </div>
          </div>

          {/* CV Passport Button */}
          <button
            onClick={() => navigate('/cv-export')}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            <FileDown className="h-4 w-4" />
            Xuất chứng nhận CV Passport
          </button>
        </div>

        {/* Details */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>
            <button
              onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isEditing
                  ? 'bg-[var(--color-primary)] text-white hover:bg-blue-700'
                  : 'border border-[var(--color-border)] hover:bg-[var(--color-secondary)]'
              }`}
            >
              {isEditing ? (
                <>
                  <Save className="h-4 w-4" /> Lưu
                </>
              ) : (
                <>
                  <Edit3 className="h-4 w-4" /> Chỉnh sửa
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div className="flex items-start gap-3">
              <Award className="mt-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div className="flex-1">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Họ và tên</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                ) : (
                  <p className="text-sm font-medium">{userProfile.displayName}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="mt-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div className="flex-1">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Email</label>
                <p className="text-sm font-medium">{userProfile.email}</p>
              </div>
            </div>

            {/* Faculty */}
            <div className="flex items-start gap-3">
              <BookOpen className="mt-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div className="flex-1">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Khoa</label>
                {isEditing ? (
                  <select
                    value={form.faculty}
                    onChange={(e) => setForm({ ...form, faculty: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="">Chọn khoa</option>
                    {FACULTIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm font-medium">{userProfile.faculty || 'Chưa cập nhật'}</p>
                )}
              </div>
            </div>

            {/* Student ID */}
            <div className="flex items-start gap-3">
              <Briefcase className="mt-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div className="flex-1">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">MSSV</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.studentId}
                    onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                ) : (
                  <p className="text-sm font-medium">{userProfile.studentId || 'Chưa cập nhật'}</p>
                )}
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-start gap-3">
              <Phone className="mt-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <div className="flex-1">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Số điện thoại</label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                ) : (
                  <p className="text-sm font-medium">{userProfile.phone || 'Chưa cập nhật'}</p>
                )}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Giới thiệu</label>
              {isEditing ? (
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              ) : (
                <p className="text-sm">{userProfile.bio || 'Chưa có giới thiệu'}</p>
              )}
            </div>

            {/* Skills */}
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Kỹ năng</label>
              {isEditing ? (
                <input
                  type="text"
                  value={form.skills}
                  onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  placeholder="React, Python, Thiết kế (phân cách bằng dấu phẩy)"
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {userProfile.skills?.length > 0 ? (
                    userProfile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--color-muted-foreground)]">Chưa cập nhật</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
