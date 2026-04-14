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

// ===== Gamification: Badges =====
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;        // emoji
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  category: 'jobs' | 'rating' | 'social' | 'profile';
}

export const BADGES: BadgeDefinition[] = [
  // Jobs milestones
  { id: 'first_job',      name: 'Khởi Đầu',       description: 'Hoàn thành công việc đầu tiên',    icon: '🏆', tier: 'bronze',   category: 'jobs' },
  { id: 'five_jobs',      name: 'Chuyên Cần',      description: 'Hoàn thành 5 công việc',           icon: '🎯', tier: 'silver',   category: 'jobs' },
  { id: 'ten_jobs',       name: 'Bậc Thầy',        description: 'Hoàn thành 10 công việc',          icon: '💎', tier: 'gold',     category: 'jobs' },
  { id: 'twenty_jobs',    name: 'Huyền Thoại',     description: 'Hoàn thành 20 công việc',          icon: '👑', tier: 'platinum', category: 'jobs' },
  // Rating achievements
  { id: 'first_star',     name: 'Ngôi Sao',        description: 'Nhận đánh giá 5 sao đầu tiên',    icon: '⭐', tier: 'bronze',   category: 'rating' },
  { id: 'high_rating',    name: 'Xuất Sắc',        description: 'Đạt điểm đánh giá ≥ 4.5',         icon: '🌟', tier: 'gold',     category: 'rating' },
  { id: 'ten_reviews',    name: 'Uy Tín Vàng',     description: 'Nhận được 10+ đánh giá',           icon: '📝', tier: 'silver',   category: 'rating' },
  { id: 'twenty_reviews', name: 'Siêu Uy Tín',     description: 'Nhận được 20+ đánh giá',           icon: '🏅', tier: 'gold',     category: 'rating' },
  // Social
  { id: 'first_post',     name: 'Nhà Tuyển Dụng',  description: 'Đăng công việc đầu tiên',          icon: '📌', tier: 'bronze',   category: 'social' },
  { id: 'five_posts',     name: 'Nhà Tạo Việc',    description: 'Đã đăng 5 công việc',              icon: '🚀', tier: 'silver',   category: 'social' },
  { id: 'urgent_hero',    name: 'Tốc Hành',        description: 'Hoàn thành 3 việc khẩn cấp',       icon: '🔥', tier: 'silver',   category: 'social' },
  // Profile
  { id: 'full_profile',   name: 'Hồ Sơ Vàng',     description: 'Hoàn thiện 100% hồ sơ cá nhân',    icon: '🎓', tier: 'bronze',   category: 'profile' },
  { id: 'skill_master',   name: 'Đa Năng',         description: 'Thêm 5+ kỹ năng vào hồ sơ',       icon: '🛠️', tier: 'bronze',   category: 'profile' },
];

// ===== Gamification: Levels =====
export interface LevelDefinition {
  level: number;
  name: string;
  minXP: number;
  maxXP: number;
  color: string;       // tailwind text color
  bgColor: string;     // tailwind bg color
}

export const LEVELS: LevelDefinition[] = [
  { level: 1, name: 'Tân Binh',       minXP: 0,    maxXP: 199,  color: 'text-gray-600',   bgColor: 'bg-gray-100' },
  { level: 2, name: 'Thành Viên',     minXP: 200,  maxXP: 499,  color: 'text-blue-600',   bgColor: 'bg-blue-100' },
  { level: 3, name: 'Cộng Tác Viên',  minXP: 500,  maxXP: 999,  color: 'text-green-600',  bgColor: 'bg-green-100' },
  { level: 4, name: 'Chuyên Gia',     minXP: 1000, maxXP: 1999, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { level: 5, name: 'Huyền Thoại',    minXP: 2000, maxXP: 99999, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
];

// XP rewards per action
export const XP_REWARDS = {
  COMPLETE_JOB: 100,
  POST_JOB: 30,
  RECEIVE_RATING: 20,
  FIVE_STAR_BONUS: 50,
  COMPLETE_PROFILE: 80,
} as const;

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
