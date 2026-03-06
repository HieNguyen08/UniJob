# 📋 UniJob (Uni Task Hub) - Project Review & Technology Plan

> **Ngày tạo:** 05/03/2026  
> **Deadline nộp bài:** 15/04/2026  
> **Thời gian còn lại:** ~41 ngày  
> **Môn học:** Electronic Commerce - CO3027 (HK252)

---

## 📌 1. TỔNG QUAN DỰ ÁN

### 1.1 Concept
**UniJob** (Uni Task Hub) là nền tảng **thương mại điện tử nội bộ** dành cho cộng đồng đại học, hoạt động theo mô hình **C2C và B2C nội bộ**.

**Mục tiêu:** Số hóa và chuẩn hóa quy trình giao – nhận task/job ngắn hạn trong phạm vi trường đại học, thay thế các kênh phi chính thức (Facebook, Zalo, Email).

### 1.2 Vấn đề giải quyết
| # | Vấn đề | Giải pháp UniJob |
|---|--------|-----------------|
| 1 | Thông tin phân tán, thiếu hệ thống | Hệ thống tập trung với bộ lọc, phân loại, tìm kiếm |
| 2 | Thiếu cơ chế đánh giá năng lực | Hệ thống rating gamification + profile portfolio |
| 3 | Quy trình giao việc không số hóa | Workflow khép kín: Đăng → Ứng tuyển → Nhận việc → Hoàn thành → Đánh giá |

### 1.3 Đối tượng người dùng
- **Bên đăng task:** Giảng viên, phòng ban, CLB, Đoàn-Hội, sinh viên
- **Bên nhận task:** Sinh viên muốn tích lũy kinh nghiệm, thu nhập, điểm rèn luyện

### 1.4 Mô hình kinh doanh
- **C2C:** Sinh viên ↔ Sinh viên (gia sư, hỗ trợ học tập)
- **B2C:** Tổ chức/Giảng viên → Sinh viên (trợ giảng, nhập liệu, sự kiện)

---

## 📌 2. DANH SÁCH CHỨC NĂNG (TỪ BRAINSTORM)

### 2.1 Chức năng ưu tiên cao (Priority 4-5) ⭐
| # | Chức năng | Mô tả | Ưu tiên | Trạng thái Figma |
|---|-----------|-------|---------|------------------|
| 1 | Bộ lọc công việc | Search, filter, pagination | 5 | Done |
| 2 | Thao tác công việc | CRUD job (đăng/sửa/xóa/ứng tuyển) | 5 | Done |
| 3 | Profile cá nhân (Portfolio) | Tên, Khoa, Rating, SĐT, Email | 5 | Done (9/3) |
| 4 | Đăng nhập Google (mail trường) | Xác thực qua email sinh viên | 5 | Done |
| 5 | Giới hạn số job đang nhận | Anti ôm việc, dựa trên điểm uy tín | 5 | Done |
| 6 | Đăng job ẩn danh | Ẩn danh nhưng vẫn xác thực sinh viên | 5 | Done |
| 7 | Việc khẩn cấp | Nút bấm cho nhu cầu 30 phút - 1 tiếng | 4 | Done |
| 8 | Đề xuất job theo khoa/ngành | Ưu tiên hiển thị job cùng khoa | 4 | Done |

### 2.2 Chức năng ưu tiên trung bình (Priority 2-3) 
| # | Chức năng | Mô tả | Ưu tiên | Trạng thái Figma |
|---|-----------|-------|---------|------------------|
| 9 | Đánh giá Gamification | Thang điểm uy tín từ lịch sử công việc | 3 | Done |
| 10 | Chính sách huỷ & phạt uy tín | Cơ chế huỷ job có điều kiện, trừ điểm | 3 | Done |
| 11 | Lịch sử hợp tác (Work History Pair) | Lưu & gợi ý partner đã từng hợp tác | 3 | Done |
| 12 | Xác nhận hoàn thành 2 bước | Người làm + Người đăng đều xác nhận | 2 | Done |

### 2.3 Chức năng nâng cao (Priority 1) - Phase 2
| # | Chức năng | Mô tả | Ưu tiên |
|---|-----------|-------|---------|
| 13 | In chứng nhận CV Passport | Xuất PDF chứng nhận kinh nghiệm | 1 |

---

## 📌 3. YÊU CẦU BÀI TẬP (Assignment Mapping)

| Part | Nội dung | Điểm | Trạng thái |
|------|----------|------|------------|
| **1.1** | Identify Project (Vấn đề, ý tưởng, thị trường, khách hàng) | 0.5 | ✅ Đã có (1.1.pdf) |
| **1.2** | Business Model Canvas | 0.5 | ✅ Đã có (TMDT_Business Canvas.png) |
| **1.3** | Pricing model, Revenue model | 1.0 | ❌ Chưa làm |
| **1.4** | Development plan, estimated cost | 1.0 | ❌ Chưa làm |
| **2.1** | UI/UX Design (Figma) | 1.5 | ✅ Đã hoàn thành |
| **2.2** | Visual Design principles | 0.5 | ❌ Chưa làm |
| **3.1** | Deploy website/app demo | - | ❌ Chưa làm |
| **3.2** | Demo code | 2.0 | ❌ Chưa làm |
| **4.1** | Video giới thiệu | 1.0 | ❌ Chưa làm |
| **4.2** | Report format | 1.0 | ❌ Chưa làm |
| **5** | Advanced features (4th wave e-commerce) | 1.0 | ❌ Chưa làm |

---

## 📌 4. TECHNOLOGY STACK RECOMMENDATION

### 4.1 Stack đã xác nhận (từ team)
> Nguồn: CSV danh sách chức năng - cột ghi chú

- **Source Control:** GitHub
- **Design:** Figma
- **Frontend:** React.js
- **Backend/DB:** Firebase

### 4.2 Chi tiết Technology Stack đề xuất

```
┌─────────────────────────────────────────────────────────┐
│                    UNIJOB TECH STACK                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─── Frontend ────────────────────────────────────┐    │
│  │  React.js 18+ (Vite)                            │    │
│  │  TypeScript                                     │    │
│  │  Tailwind CSS + shadcn/ui                       │    │
│  │  React Router v6                                │    │
│  │  Zustand (State Management)                     │    │
│  │  React Query / TanStack Query                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─── Backend (Firebase) ──────────────────────────┐    │
│  │  Firebase Authentication (Google Sign-in)       │    │
│  │  Cloud Firestore (NoSQL Database)               │    │
│  │  Firebase Cloud Functions (Serverless)          │    │
│  │  Firebase Storage (File uploads)                │    │
│  │  Firebase Hosting                               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─── DevOps & Tools ─────────────────────────────┐    │
│  │  GitHub (Version Control + CI/CD Actions)       │    │
│  │  Figma (UI/UX Design)                          │    │
│  │  Vercel hoặc Firebase Hosting (Deploy)          │    │
│  │  ESLint + Prettier (Code Quality)               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─── Libraries bổ sung ──────────────────────────┐    │
│  │  react-hot-toast (Notifications)                │    │
│  │  jsPDF / react-pdf (Xuất CV PDF)                │    │
│  │  date-fns (Xử lý thời gian)                    │    │
│  │  Lucide React (Icons)                           │    │
│  │  Framer Motion (Animations)                     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Giải thích lựa chọn công nghệ

| Công nghệ | Lý do chọn |
|-----------|------------|
| **React + Vite** | Build nhanh, ecosystem lớn, team đã quen |
| **TypeScript** | Type safety, ít bug runtime, IntelliSense tốt |
| **Tailwind CSS** | Rapid prototyping, responsive design dễ dàng |
| **shadcn/ui** | Component library đẹp, customizable, accessibility tốt |
| **Firebase Auth** | Tích hợp Google Sign-in nhanh, hỗ trợ giới hạn domain email |
| **Firestore** | Realtime sync, NoSQL linh hoạt, free tier đủ dùng cho demo |
| **Cloud Functions** | Serverless logic (xử lý rating, job matching, notifications) |
| **Zustand** | State management nhẹ, đơn giản hơn Redux |

### 4.4 Firebase Free Tier (Spark Plan) - Đủ cho Demo
| Service | Free Limit | Dự kiến sử dụng |
|---------|-----------|-----------------|
| Auth | 10K users/month | Đủ (demo < 100 users) |
| Firestore | 1GB storage, 50K reads/day | Đủ |
| Hosting | 10GB transfer/month | Đủ |
| Storage | 5GB | Đủ |
| Functions | 2M invocations/month | Đủ |

---

## 📌 5. KIẾN TRÚC HỆ THỐNG

### 5.1 Folder Structure

```
UniJob/
├── public/
│   ├── favicon.ico
│   └── index.html
├── src/
│   ├── assets/              # Images, fonts
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # Header, Footer, Sidebar
│   │   ├── job/             # Job-related components
│   │   ├── profile/         # Profile components
│   │   └── common/          # Shared components
│   ├── pages/               # Route pages
│   │   ├── Home.tsx
│   │   ├── JobList.tsx
│   │   ├── JobDetail.tsx
│   │   ├── CreateJob.tsx
│   │   ├── Profile.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   └── NotFound.tsx
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities, helpers
│   │   ├── firebase.ts      # Firebase config & init
│   │   ├── utils.ts
│   │   └── constants.ts
│   ├── services/            # Firebase service layer
│   │   ├── auth.service.ts
│   │   ├── job.service.ts
│   │   ├── user.service.ts
│   │   └── rating.service.ts
│   ├── store/               # Zustand stores
│   │   ├── authStore.ts
│   │   └── jobStore.ts
│   ├── types/               # TypeScript types
│   │   ├── job.ts
│   │   ├── user.ts
│   │   └── rating.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── functions/               # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts
│   │   ├── jobs.ts
│   │   ├── ratings.ts
│   │   └── notifications.ts
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules          # Firestore security rules
├── firebase.json            # Firebase config
├── .firebaserc
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
├── .env.local               # Firebase keys (gitignored)
├── .gitignore
└── README.md
```

### 5.2 Database Schema (Firestore Collections)

```
📁 users/
│   └── {userId}
│       ├── email: string
│       ├── displayName: string
│       ├── photoURL: string
│       ├── faculty: string          // Khoa
│       ├── department: string       // Ngành
│       ├── studentId: string        // MSSV
│       ├── phone: string
│       ├── bio: string
│       ├── skills: string[]
│       ├── ratingScore: number      // Điểm uy tín (0-5)
│       ├── totalRatings: number
│       ├── activeJobCount: number   // Số job đang nhận
│       ├── maxJobLimit: number      // Giới hạn job (dựa trên uy tín)
│       ├── isAnonymous: boolean
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp

📁 jobs/
│   └── {jobId}
│       ├── title: string
│       ├── description: string
│       ├── category: string         // gia sư, trợ giảng, sự kiện...
│       ├── faculty: string          // Khoa liên quan
│       ├── isUrgent: boolean        // Việc khẩn cấp
│       ├── isAnonymous: boolean     // Đăng ẩn danh
│       ├── payment: number
│       ├── paymentType: string      // hourly/fixed/volunteer
│       ├── duration: string
│       ├── deadline: timestamp
│       ├── maxApplicants: number
│       ├── status: string           // open/in-progress/completed/cancelled
│       ├── postedBy: string         // userId
│       ├── assignedTo: string[]     // userId[] 
│       ├── applicants: string[]     // userId[]
│       ├── tags: string[]
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp

📁 applications/
│   └── {applicationId}
│       ├── jobId: string
│       ├── applicantId: string
│       ├── message: string
│       ├── status: string           // pending/accepted/rejected
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp

📁 ratings/
│   └── {ratingId}
│       ├── jobId: string
│       ├── fromUserId: string
│       ├── toUserId: string
│       ├── score: number            // 1-5
│       ├── comment: string
│       ├── createdAt: timestamp
│       └── type: string             // poster-to-worker / worker-to-poster

📁 jobCompletions/
│   └── {completionId}
│       ├── jobId: string
│       ├── workerConfirmed: boolean
│       ├── posterConfirmed: boolean
│       ├── completedAt: timestamp
│       └── status: string           // pending/confirmed/disputed

📁 workHistory/
│   └── {historyId}
│       ├── user1: string
│       ├── user2: string
│       ├── jobId: string
│       ├── completedAt: timestamp
│       └── rating: number
```

---

## 📌 6. PHÂN CÔNG NHÓM & VAI TRÒ

> ⚠️ **Figma đã hoàn thành** → Lộc chuyển sang tham gia code frontend + documentation

### 6.1 Thành viên & Vai trò

| # | Thành viên | Vai trò chính | Trách nhiệm |
|---|------------|--------------|-------------|
| 1 | **Nguyễn Minh Hiếu** | 🔧 **Tech Lead / Full-stack** | Kiến trúc hệ thống, setup dự án, review code, Firebase config, tích hợp hệ thống |
| 2 | **Thái Bảo Long** | 🎨 **Frontend Developer 1** | Job Listing, Job Detail, Create Job UI, kết nối Firestore |
| 3 | **Ngô Quang Anh** | 🎨 **Frontend Developer 2** | Dashboard, Profile, Rating UI, responsive & animations |
| 4 | **Diệp Vũ Minh** | ⚙️ **Backend/Firebase Developer** | Firestore services, Security Rules, Cloud Functions, data seeding |
| 5 | **Lộc** | 🎨📝 **Frontend Developer 3 + Documentation** | Home page, Urgent mode, Notification UI, báo cáo, video demo |

### 6.2 Phân bổ khối lượng (Workload Balance)

```
           Code Tasks    Doc Tasks    Tổng
Hiếu  ▓▓▓▓▓▓▓▓░░░░  ▓▓░░░░░░░░░░   ~60% code / ~15% docs / ~25% review
Long  ▓▓▓▓▓▓▓▓▓▓░░  ░░░░░░░░░░░░   ~85% code / ~15% testing
Anh   ▓▓▓▓▓▓▓▓▓░░░  ▓░░░░░░░░░░░   ~75% code / ~10% docs / ~15% testing
Minh  ▓▓▓▓▓▓▓▓▓▓░░  ▓░░░░░░░░░░░   ~80% code / ~10% docs / ~10% testing
Lộc   ▓▓▓▓▓▓▓░░░░░  ▓▓▓▓▓░░░░░░░   ~55% code / ~35% docs / ~10% video
```

### 6.3 Trách nhiệm Assignment Parts (Bài nộp)

| Part | Nội dung | Điểm | Người phụ trách | Hỗ trợ |
|------|----------|------|-----------------|--------|
| **1.1** | Identify Project (Vấn đề, ý tưởng, thị trường) | 0.5 | Lộc | Hiếu |
| **1.2** | Business Model Canvas | 0.5 | Lộc | Minh |
| **1.3** | Pricing model, Revenue model | 1.0 | Lộc + Minh | Hiếu |
| **1.4** | Development plan, Estimated cost | 1.0 | Hiếu + Lộc | — |
| **2.1** | UI/UX Design (Figma) | 1.5 | ✅ **ĐÃ HOÀN THÀNH** | — |
| **2.2** | Visual Design principles | 0.5 | Lộc | Anh |
| **3.1** | Deploy website/app demo | — | Hiếu | Minh |
| **3.2** | Demo code (source code + demo chức năng) | 2.0 | **Cả team** (5 người đều code) | — |
| **4.1** | Video giới thiệu sản phẩm | 1.0 | Lộc + Anh | — |
| **4.2** | Report format | 1.0 | Lộc | Hiếu |
| **5** | Advanced features (4th wave e-commerce) | 1.0 | Hiếu + Minh | Lộc |

### 6.4 Git Branch Strategy & Ownership

```
main                          ← Production (chỉ Hiếu merge)
├── develop                   ← Integration (team merge PR vào đây)
│   │
│   ├── feature/auth          ← Hiếu: Google Sign-in, auth flow
│   ├── feature/job-crud      ← Long: Đăng/Sửa/Xóa job
│   ├── feature/job-listing   ← Long: Danh sách + Filter + Search
│   ├── feature/job-detail    ← Long: Chi tiết job + Ứng tuyển
│   ├── feature/profile       ← Anh: Profile cá nhân
│   ├── feature/dashboard     ← Anh: Dashboard quản lý
│   ├── feature/rating        ← Anh + Minh: Hệ thống đánh giá
│   ├── feature/home          ← Lộc: Home page (real data, featured jobs)
│   ├── feature/urgent        ← Lộc: Việc khẩn cấp UI + countdown
│   ├── feature/anonymous     ← Long: Đăng job ẩn danh
│   ├── feature/notification  ← Lộc: Notification UI components
│   ├── feature/job-limit     ← Minh: Giới hạn số job
│   ├── feature/job-suggest   ← Minh: Đề xuất job theo khoa
│   ├── feature/completion    ← Minh: Xác nhận hoàn thành 2 bước
│   ├── feature/cancel-policy ← Minh: Chính sách huỷ & phạt
│   ├── feature/work-history  ← Anh: Lịch sử hợp tác
│   ├── feature/cv-pdf        ← Hiếu: In chứng nhận CV
│   ├── feature/ai-suggest    ← Hiếu: AI gợi ý
│   └── feature/security      ← Minh: Firestore Security Rules
│
└── docs/report               ← Lộc: Báo cáo & tài liệu
```

---

## 📌 7. DEVELOPMENT PLAN & TIMELINE (PHÂN CÔNG CHI TIẾT)

### Phase 0: Setup (05/03 - 08/03) — 4 ngày ✅
| Task | Assignee | Status |
|------|----------|--------|
| Init React + Vite + TypeScript project | Hiếu | ✅ Done |
| Setup Tailwind CSS | Hiếu | ✅ Done |
| Setup Firebase project (Auth, Firestore, Hosting) | Hiếu | ✅ Done (config sẵn, cần điền key) |
| Config ESLint + Prettier | Hiếu | ✅ Done |
| Setup GitHub repo + branch strategy | Hiếu | ✅ Done |
| Tạo folder structure + scaffold code | Hiếu | ✅ Done |
| Docker + CI/CD setup | Hiếu | ✅ Done |

### Phase 1: Core Features (09/03 - 22/03) — 14 ngày

#### 🔴 Tuần 1 (09/03 - 15/03): Foundation

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| Tạo Firebase project trên Console, điền API keys | Hiếu | main | P0 | ⬜ |
| **Authentication** - Google Sign-in, restrict @hcmut.edu.vn, auth guard | Hiếu | feature/auth | P0 | ⬜ |
| **Job CRUD** - Form đăng job, sửa job, xóa job (kết nối Firestore) | Long | feature/job-crud | P0 | ⬜ |
| **Profile** - Trang cá nhân, chỉnh sửa thông tin, avatar | Anh | feature/profile | P0 | ⬜ |
| **Firestore indexes** + cấu trúc collection theo schema | Minh | feature/security | P0 | ⬜ |
| **Home page** - Kết nối real data (featured jobs, stats, categories) | Lộc | feature/home | P0 | ⬜ |
| Bắt đầu viết Part 1 báo cáo (Identify, BMC) song song | Lộc | docs/report | P1 | ⬜ |

#### 🔴 Tuần 2 (16/03 - 22/03): Core Pages

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **Job Listing** - Danh sách + Filter + Search + Pagination (real data) | Long | feature/job-listing | P0 | ⬜ |
| **Job Detail** - Trang chi tiết + nút ứng tuyển + quản lý ứng viên | Long | feature/job-detail | P0 | ⬜ |
| **Dashboard** - Tab job đã đăng / đã ứng tuyển (real data) | Anh | feature/dashboard | P0 | ⬜ |
| **Layout polish** - Responsive mobile, loading states, error handling | Lộc | develop | P1 | ⬜ |
| Firestore basic Security Rules (auth required, owner check) | Minh | feature/security | P0 | ⬜ |
| User service: getUserById, updateProfile, canAcceptMoreJobs | Minh | feature/job-limit | P0 | ⬜ |
| Review code & merge PRs vào develop | Hiếu | develop | P0 | ⬜ |
| Hoàn thành Part 1.3 (Pricing + Revenue model) | Lộc + Minh | docs/report | P1 | ⬜ |

> **📅 Milestone Tuần 2:** MVP chạy được — Đăng nhập → Xem danh sách → Đăng job → Ứng tuyển → Xem profile

### Phase 2: Business Logic (23/03 - 01/04) — 10 ngày

#### 🟡 Tuần 3 (23/03 - 29/03): Business Features

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **Việc khẩn cấp** - Urgent mode UI + countdown timer + filter | Lộc | feature/urgent | P1 | ⬜ |
| **Đăng job ẩn danh** - Toggle ẩn danh, hiển thị "Ẩn danh" thay tên | Long | feature/anonymous | P1 | ⬜ |
| **Rating system** - UI đánh giá sao + comment sau hoàn thành job | Anh | feature/rating | P1 | ⬜ |
| **Xác nhận hoàn thành 2 bước** - Worker confirm + Poster confirm | Minh | feature/completion | P1 | ⬜ |
| **Giới hạn số job đang nhận** - Logic check + hiển thị cảnh báo | Minh | feature/job-limit | P1 | ⬜ |
| Rating service: submitRating, tính avg, cập nhật user score | Minh | feature/rating | P1 | ⬜ |
| **Notification UI** - Toast + dropdown thông báo job mới, ứng tuyển | Lộc | feature/notification | P1 | ⬜ |
| Integration test auth flow + job flow end-to-end | Hiếu | develop | P0 | ⬜ |

#### 🟡 Tuần 4 (30/03 - 01/04): Advanced Business

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **Đề xuất job theo khoa/ngành** - Algorithm + UI section "Gợi ý cho bạn" | Minh | feature/job-suggest | P1 | ⬜ |
| **Chính sách huỷ & phạt uy tín** - Logic trừ điểm, UI xác nhận huỷ | Minh | feature/cancel-policy | P2 | ⬜ |
| **Lịch sử hợp tác** - UI danh sách partner, gợi ý partner cũ | Anh | feature/work-history | P2 | ⬜ |
| Polish UI: animations, transitions, empty states, skeleton loading | Long | develop | P1 | ⬜ |
| Viết Part 1.4 (Dev plan + Cost) + Part 2.2 (Visual Design) | Lộc | docs/report | P1 | ⬜ |
| Merge tất cả features Phase 2 → develop | Hiếu | develop | P0 | ⬜ |

> **📅 Milestone Tuần 4:** Tất cả 13 chức năng hoạt động — Rating, Urgent, Anonymous, Job limit, Suggest, Cancel, Work history

### Phase 3: Advanced & Polish (02/04 - 08/04) — 7 ngày

#### 🟢 Tuần 5 (02/04 - 08/04): Advanced + QA

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **In chứng nhận CV Passport** - Xuất PDF với jsPDF | Hiếu | feature/cv-pdf | P2 | ⬜ |
| **AI Job Matching** - Algorithm gợi ý dựa trên skills + history | Hiếu | feature/ai-suggest | P2 | ⬜ |
| **Firestore Security Rules** hoàn chỉnh (production-ready) | Minh | feature/security | P1 | ⬜ |
| **Real-time notifications** - Firestore onSnapshot cho job mới | Minh | feature/security | P2 | ⬜ |
| **Testing toàn bộ flow** - Test tất cả chức năng, fix bugs | Long + Lộc | develop | P0 | ⬜ |
| **Performance** - Lazy loading, code splitting, image optimization | Long | develop | P2 | ⬜ |
| **Responsive final check** - Test trên mobile, tablet, desktop | Anh | develop | P1 | ⬜ |
| Viết Part 5 (Advanced features documentation) | Hiếu + Lộc | docs/report | P1 | ⬜ |

> **📅 Milestone Tuần 5:** Code freeze — Không thêm feature mới, chỉ fix bug

### Phase 4: Deploy & Documentation (09/04 - 14/04) — 6 ngày

#### 🔵 Tuần 6 (09/04 - 14/04): Ship It! 🚀

| Task | Assignee | Deadline | Ưu tiên | Status |
|------|----------|----------|---------|--------|
| Deploy lên Firebase Hosting | Hiếu | 09/04 | P0 | ⬜ |
| Tạo script seed demo data (20+ jobs, 10+ users, ratings) | Minh | 10/04 | P0 | ⬜ |
| Nhập demo data lên production | Minh + Long | 10/04 | P0 | ⬜ |
| Hoàn thành báo cáo Part 1-5 (tổng hợp, format đẹp) | Lộc | 12/04 | P0 | ⬜ |
| Quay video demo sản phẩm (3-5 phút) | Lộc + Anh | 13/04 | P0 | ⬜ |
| Review report format, chỉnh sửa lần cuối | Hiếu + Lộc | 13/04 | P0 | ⬜ |
| Final testing trên production | Cả team | 14/04 | P0 | ⬜ |
| **NỘP BÀI** | Cả team | **15/04** | 🔴 | ⬜ |

---

## 📌 8. TỔNG HỢP CÔNG VIỆC THEO THÀNH VIÊN

### 👤 Nguyễn Minh Hiếu (Tech Lead) — ~10 tasks
| Tuần | Công việc chính | Công việc phụ |
|------|----------------|---------------|
| 1 | Firebase Console setup, Authentication | Code review |
| 2 | Code review, merge PRs vào develop | Hỗ trợ debug |
| 3 | Integration test auth + job flow E2E | — |
| 4 | Merge Phase 2 features | — |
| 5 | CV PDF export, AI Job Matching | Part 5 advanced docs |
| 6 | Deploy Firebase Hosting, review report | Final testing |

### 👤 Thái Bảo Long (Frontend Dev 1) — ~8 tasks
| Tuần | Công việc chính | Công việc phụ |
|------|----------------|---------------|
| 1 | Job CRUD — form đăng/sửa/xóa job | — |
| 2 | Job Listing + Job Detail (real data) | — |
| 3 | Đăng job ẩn danh (Anonymous toggle) | — |
| 4 | Polish UI, animations, transitions, skeleton | — |
| 5 | Testing toàn bộ flow, performance optimization | — |
| 6 | Nhập demo data | Final testing |

### 👤 Ngô Quang Anh (Frontend Dev 2) — ~8 tasks
| Tuần | Công việc chính | Công việc phụ |
|------|----------------|---------------|
| 1 | Profile page (chỉnh sửa, avatar) | — |
| 2 | Dashboard (job đã đăng/ứng tuyển) | — |
| 3 | Rating system UI (đánh giá sao + comment) | — |
| 4 | Lịch sử hợp tác UI | — |
| 5 | Responsive final check (mobile/tablet/desktop) | — |
| 6 | Quay video demo | Final testing |

### 👤 Diệp Vũ Minh (Backend/Firebase Dev) — ~10 tasks
| Tuần | Công việc chính | Công việc phụ |
|------|----------------|---------------|
| 1 | Firestore indexes + collection structure | — |
| 2 | Security Rules cơ bản + User service | Hỗ trợ Part 1.3 |
| 3 | Completion 2 bước + Job limit logic + Rating service | — |
| 4 | Job suggest algorithm + Cancel policy logic | — |
| 5 | Security Rules hoàn chỉnh + Realtime notifications | — |
| 6 | Seed data script + nhập demo data | Final testing |

### 👤 Lộc (Frontend Dev 3 + Docs) — ~10 tasks
| Tuần | Công việc chính | Công việc phụ |
|------|----------------|---------------|
| 1 | 🎨 **Home page** (real data, featured jobs, stats) | Part 1 báo cáo (bắt đầu) |
| 2 | 🎨 **Layout polish** (responsive, loading, error states) | Part 1.3 (Pricing + Revenue) |
| 3 | 🎨 **Urgent mode UI** (countdown timer + filter) + **Notification UI** | — |
| 4 | 📝 Part 1.4 (Dev plan + Cost) + Part 2.2 (Visual Design) | — |
| 5 | 🧪 Testing + fix bugs + 📝 Part 5 (Advanced docs) | — |
| 6 | 📝 Hoàn thành report + 🎥 Quay video demo | Review format |

---

## 📌 9. QUY TẮC LÀM VIỆC NHÓM

### 9.1 Communication
- **Group chat:** Zalo/Discord — cập nhật tiến độ hàng ngày
- **Sync meeting:** Mỗi tuần 1 buổi (Chủ nhật tối) — review tiến độ, demo, plan tuần sau
- **Urgent issues:** Tag @all trong group chat

### 9.2 Git Rules
- ❌ **KHÔNG push trực tiếp vào `main`** — chỉ Hiếu merge từ develop
- ✅ Mỗi feature 1 branch riêng: `feature/tên-feature`
- ✅ Tạo Pull Request (PR) khi hoàn thành feature
- ✅ Ít nhất 1 người review PR trước khi merge vào develop
- ✅ Commit message format: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`
- ✅ Commit thường xuyên (mỗi ngày ít nhất 1 commit khi đang code)

### 9.3 Code Standards
- TypeScript strict mode
- Tailwind CSS cho styling (không dùng CSS thuần)
- Component naming: PascalCase (`JobCard.tsx`)
- File naming: camelCase cho services/utils (`job.service.ts`)
- Mỗi component < 200 dòng → tách nhỏ nếu lớn hơn

### 9.4 Deadline nội bộ
| Mốc | Ngày | Nội dung | Check bởi |
|------|------|----------|-----------|
| 🔴 M1 | **15/03** | Auth + Job CRUD + Profile chạy được | Hiếu |
| 🔴 M2 | **22/03** | MVP hoàn chỉnh (tất cả core pages) | Hiếu |
| 🟡 M3 | **01/04** | Tất cả 13 chức năng hoạt động | Cả team |
| 🟢 M4 | **08/04** | Code freeze — chỉ fix bug | Hiếu |
| 🔵 M5 | **12/04** | Report + Video hoàn thành | Lộc |
| 🔵 M6 | **14/04** | Final review — nộp bài | **Cả team** |

---

## 📌 10. SETUP GUIDE (STEP-BY-STEP)

### Bước 1: Prerequisites
```bash
# Cần cài đặt
- Node.js >= 18.x (LTS)
- npm >= 9.x hoặc yarn
- Git
- VS Code (khuyến nghị)
- Firebase CLI: npm install -g firebase-tools
```

### Bước 2: Init Project
```bash
# Tạo React + Vite + TypeScript
npm create vite@latest unijob-web -- --template react-ts
cd unijob-web

# Cài dependencies chính
npm install react-router-dom zustand @tanstack/react-query
npm install firebase
npm install date-fns lucide-react framer-motion
npm install react-hot-toast
npm install jspdf

# Cài Tailwind CSS
npm install -D tailwindcss @tailwindcss/vite

# Cài shadcn/ui
npx shadcn@latest init

# Dev dependencies
npm install -D @types/node eslint prettier
```

### Bước 3: Firebase Setup
```bash
# Login Firebase
firebase login

# Init Firebase trong project
firebase init
# Chọn: Firestore, Functions, Hosting, Storage

# Tạo file .env.local
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
```

### Bước 4: Firebase Console Config
1. Tạo project mới trên [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** → Google provider
3. Giới hạn domain email: chỉ cho phép `@hcmut.edu.vn` (hoặc domain trường)
4. Tạo **Firestore Database** (start in test mode, sau đó thêm rules)
5. Enable **Storage** cho upload ảnh profile
6. Setup **Hosting**

### Bước 5: Git Workflow
```
main          ← Production (deploy)
├── develop   ← Integration branch
│   ├── feature/auth         ← Đăng nhập Google
│   ├── feature/job-crud     ← CRUD công việc
│   ├── feature/job-listing  ← Danh sách & filter
│   ├── feature/profile      ← Profile cá nhân
│   ├── feature/rating       ← Hệ thống đánh giá
│   ├── feature/urgent       ← Việc khẩn cấp
│   └── feature/dashboard    ← Dashboard quản lý
```

---

## 📌 11. ADVANCED FEATURES (4TH WAVE E-COMMERCE)

Để đạt điểm Part 5 (1 điểm), đề xuất các tính năng thuộc làn sóng thứ 4 của TMĐT:

| Feature | Mô tả | Công nghệ |
|---------|--------|-----------|
| **AI Job Matching** | Gợi ý job phù hợp dựa trên profile, kỹ năng, lịch sử | Firebase ML / Simple algorithm |
| **Real-time Notifications** | Thông báo tức thời khi có job mới, ứng tuyển | Firestore onSnapshot |
| **Social Proof & Gamification** | Badge, level, leaderboard uy tín | Custom scoring system |
| **Progressive Web App (PWA)** | Cài đặt như app native, offline support | Vite PWA plugin |
| **Smart Search** | Tìm kiếm ngữ nghĩa, auto-suggest | Algolia / Firestore index |

---

## 📌 12. ƯỚC TÍNH CHI PHÍ

| Hạng mục | Chi phí | Ghi chú |
|----------|---------|---------|
| Firebase (Spark Plan) | **$0** | Free tier đủ cho demo |
| Domain (.com) | ~$12/năm | Tùy chọn, có thể dùng firebase URL |
| Figma | **$0** | Free cho education |
| GitHub | **$0** | Free |
| Vercel Hosting (backup) | **$0** | Free tier |
| **Tổng chi phí demo** | **$0 - $12** | |

---

## 📌 13. RISK & MITIGATION

| Rủi ro | Mức độ | Giải pháp |
|--------|--------|-----------|
| Timeline quá gấp (41 ngày) | 🔴 Cao | Ưu tiên MVP, cut scope nếu cần |
| Team chưa quen Firebase | 🟡 TB | Pair programming, tutorial sessions |
| UI/UX chưa hoàn thiện | 🟡 TB | Dùng shadcn/ui có sẵn, focus vào UX flow |
| Data demo không đủ thực tế | 🟢 Thấp | Tạo script seed data |
| Firestore security rules | 🟡 TB | Viết rules ngay từ đầu |

---

## 📌 14. CHECKLIST TRƯỚC KHI NỘP (15/04/2026)

- [ ] **Part 1.1:** Identify project (đã có ✅)
- [ ] **Part 1.2:** Business Model Canvas (đã có ✅)
- [ ] **Part 1.3:** Pricing model + Revenue model
- [ ] **Part 1.4:** Development plan + Estimated cost
- [ ] **Part 2.1:** UI/UX Figma hoàn chỉnh
- [ ] **Part 2.2:** Visual Design principles document
- [ ] **Part 3.1:** Website deployed + chạy được
- [ ] **Part 3.2:** Source code + Demo chức năng
- [ ] **Part 4.1:** Video giới thiệu sản phẩm
- [ ] **Part 4.2:** Report format đẹp, chuyên nghiệp
- [ ] **Part 5:** Advanced features documentation + demo
- [ ] Source code trên GitHub
- [ ] README.md hướng dẫn cài đặt & chạy
- [ ] Demo data đầy đủ, thực tế

---

## 📌 15. GHI CHÚ & CẬP NHẬT

| Ngày | Nội dung | Người cập nhật |
|------|----------|---------------|
| 05/03/2026 | Khởi tạo Review.md - Tổng hợp concept, plan tech stack, timeline | AI Assistant |
| 05/03/2026 | **Phase 0 hoàn tất** - Init project, cài dependencies, setup Tailwind + Firebase config, tạo folder structure, types, services, stores, layout, pages, routing. Build thành công, dev server chạy OK tại `http://localhost:5173` | AI Assistant |
| 06/03/2026 | **Phân công nhóm 5 người** - Thêm Section 6-9: vai trò, phân công theo phase/tuần, git branch ownership, quy tắc nhóm, deadline nội bộ (M1-M6) | AI Assistant |
| 06/03/2026 | **Chia lại khối lượng** - Figma đã xong → Lộc chuyển thành Frontend Dev 3 + Docs, nhận code: Home page, Urgent mode, Notification UI, Layout polish. Giảm tải cho Long (bớt Urgent). Cân bằng ~8-10 tasks/người | AI Assistant |
| | | |

---

> **⚠️ LƯU Ý QUAN TRỌNG:**
> - Ưu tiên hoàn thành **MVP (Minimum Viable Product)** trước, rồi mới polish
> - MVP bao gồm: Auth + Job CRUD + Job List + Profile + Dashboard
> - Mỗi tuần nên có 1 buổi sync tiến độ team
> - Commit code thường xuyên, mỗi feature 1 branch riêng
> - Bắt đầu viết report song song với code, ĐỪNG để cuối mới viết
