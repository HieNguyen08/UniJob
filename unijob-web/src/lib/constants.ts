// ===== Job Categories =====
export const JOB_CATEGORIES = [
  { value: 'tutoring', label: 'Gia sư', icon: '📚' },
  { value: 'teaching-assistant', label: 'Trợ giảng', icon: '👨‍🏫' },
  { value: 'research', label: 'Hỗ trợ nghiên cứu', icon: '🔬' },
  { value: 'data-entry', label: 'Nhập liệu', icon: '💻' },
  { value: 'event', label: 'Tổ chức sự kiện', icon: '🎉' },
  { value: 'design', label: 'Thiết kế', icon: '🎨' },
  { value: 'translation', label: 'Dịch thuật', icon: '🌐' },
  { value: 'office', label: 'Trực văn phòng', icon: '🏢' },
  { value: 'volunteer', label: 'Tình nguyện', icon: '🤝' },
  { value: 'other', label: 'Khác', icon: '📌' },
] as const;

// ===== Job Status =====
export const JOB_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// ===== Application Status =====
export const APPLICATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

// ===== Payment Types =====
export const PAYMENT_TYPES = [
  { value: 'fixed', label: 'Trả cố định' },
  { value: 'hourly', label: 'Theo giờ' },
  { value: 'negotiable', label: 'Thỏa thuận' },
  { value: 'volunteer', label: 'Tình nguyện (không lương)' },
] as const;

// ===== Faculties at HCMUT =====
export const FACULTIES = [
  'Khoa học & Kỹ thuật Máy tính',
  'Điện - Điện tử',
  'Cơ khí',
  'Xây dựng',
  'Kỹ thuật Hóa học',
  'Môi trường & Tài nguyên',
  'Quản lý Công nghiệp',
  'Kỹ thuật Giao thông',
  'Công nghệ Vật liệu',
  'Khoa học Ứng dụng',
  'Khác',
] as const;

// ===== Rating Levels =====
export const RATING_LEVELS = [
  { min: 0, max: 1.9, label: 'Mới', color: 'text-gray-500', maxJobs: 2 },
  { min: 2.0, max: 2.9, label: 'Đáng tin', color: 'text-blue-500', maxJobs: 3 },
  { min: 3.0, max: 3.9, label: 'Tốt', color: 'text-green-500', maxJobs: 4 },
  { min: 4.0, max: 4.4, label: 'Xuất sắc', color: 'text-purple-500', maxJobs: 5 },
  { min: 4.5, max: 5.0, label: 'Huyền thoại', color: 'text-yellow-500', maxJobs: 5 },
] as const;

// ===== Sort Options =====
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'payment-high', label: 'Lương cao nhất' },
  { value: 'payment-low', label: 'Lương thấp nhất' },
  { value: 'urgent', label: 'Khẩn cấp trước' },
] as const;

// ===== Pagination =====
export const ITEMS_PER_PAGE = 200;

// ===== Urgent Job Config =====
export const URGENT_DURATION_MINUTES = 60; // 1 hour max for urgent jobs
