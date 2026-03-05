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
| **2.1** | UI/UX Design (Figma) | 1.5 | 🔄 Đang làm (nhiều trang Done) |
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

## 📌 6. DEVELOPMENT PLAN & TIMELINE

### Phase 0: Setup (05/03 - 08/03) — 4 ngày
| Task | Assignee | Status |
|------|----------|--------|
| Init React + Vite + TypeScript project | Dev Lead | ✅ Done |
| Setup Tailwind CSS + shadcn/ui | Dev Lead | ✅ Done |
| Setup Firebase project (Auth, Firestore, Hosting) | Dev Lead | ✅ Done (config sẵn, cần điền key) |
| Config ESLint + Prettier + Git hooks | Dev Lead | ✅ Done |
| Setup GitHub repo + branch strategy | All | ⬜ |
| Tạo folder structure chuẩn | Dev Lead | ✅ Done |

### Phase 1: Core Features (09/03 - 22/03) — 14 ngày
| Task | Ưu tiên | Status |
|------|---------|--------|
| **Authentication** - Google Sign-in (mail trường) | P0 | ⬜ |
| **Job CRUD** - Đăng/Sửa/Xóa job | P0 | ⬜ |
| **Job Listing** - Danh sách + Filter + Search + Pagination | P0 | ⬜ |
| **Job Detail** - Trang chi tiết job + Ứng tuyển | P0 | ⬜ |
| **User Profile** - Trang cá nhân (Portfolio) | P0 | ⬜ |
| **Dashboard** - Quản lý job đã đăng/đã nhận | P0 | ⬜ |
| **Layout** - Header, Footer, Navigation, Responsive | P0 | ⬜ |

### Phase 2: Business Logic (23/03 - 01/04) — 10 ngày
| Task | Ưu tiên | Status |
|------|---------|--------|
| Hệ thống đánh giá Gamification (Rating) | P1 | ⬜ |
| Xác nhận hoàn thành 2 bước | P1 | ⬜ |
| Việc khẩn cấp (Urgent mode) | P1 | ⬜ |
| Đăng job ẩn danh | P1 | ⬜ |
| Giới hạn số job đang nhận | P1 | ⬜ |
| Đề xuất job theo khoa/ngành | P1 | ⬜ |
| Chính sách huỷ & phạt uy tín | P2 | ⬜ |
| Lịch sử hợp tác (Work History Pair) | P2 | ⬜ |

### Phase 3: Advanced & Polish (02/04 - 08/04) — 7 ngày
| Task | Ưu tiên | Status |
|------|---------|--------|
| In chứng nhận CV Passport (PDF) | P2 | ⬜ |
| Advanced features (4th wave e-commerce: AI gợi ý, chatbot...) | P2 | ⬜ |
| Firestore Security Rules | P1 | ⬜ |
| Performance optimization | P2 | ⬜ |
| Testing & Bug fixes | P0 | ⬜ |

### Phase 4: Deploy & Documentation (09/04 - 14/04) — 6 ngày
| Task | Ưu tiên | Status |
|------|---------|--------|
| Deploy lên Firebase Hosting / Vercel | P0 | ⬜ |
| Nhập dữ liệu demo | P0 | ⬜ |
| Viết báo cáo (Pricing model, Revenue model, Dev plan) | P0 | ⬜ |
| Giải thích Visual Design principles | P1 | ⬜ |
| Quay video demo giới thiệu sản phẩm | P0 | ⬜ |
| Review & Format report | P0 | ⬜ |

---

## 📌 7. SETUP GUIDE (STEP-BY-STEP)

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

## 📌 8. ADVANCED FEATURES (4TH WAVE E-COMMERCE)

Để đạt điểm Part 5 (1 điểm), đề xuất các tính năng thuộc làn sóng thứ 4 của TMĐT:

| Feature | Mô tả | Công nghệ |
|---------|--------|-----------|
| **AI Job Matching** | Gợi ý job phù hợp dựa trên profile, kỹ năng, lịch sử | Firebase ML / Simple algorithm |
| **Real-time Notifications** | Thông báo tức thời khi có job mới, ứng tuyển | Firestore onSnapshot |
| **Social Proof & Gamification** | Badge, level, leaderboard uy tín | Custom scoring system |
| **Progressive Web App (PWA)** | Cài đặt như app native, offline support | Vite PWA plugin |
| **Smart Search** | Tìm kiếm ngữ nghĩa, auto-suggest | Algolia / Firestore index |

---

## 📌 9. ƯỚC TÍNH CHI PHÍ

| Hạng mục | Chi phí | Ghi chú |
|----------|---------|---------|
| Firebase (Spark Plan) | **$0** | Free tier đủ cho demo |
| Domain (.com) | ~$12/năm | Tùy chọn, có thể dùng firebase URL |
| Figma | **$0** | Free cho education |
| GitHub | **$0** | Free |
| Vercel Hosting (backup) | **$0** | Free tier |
| **Tổng chi phí demo** | **$0 - $12** | |

---

## 📌 10. RISK & MITIGATION

| Rủi ro | Mức độ | Giải pháp |
|--------|--------|-----------|
| Timeline quá gấp (41 ngày) | 🔴 Cao | Ưu tiên MVP, cut scope nếu cần |
| Team chưa quen Firebase | 🟡 TB | Pair programming, tutorial sessions |
| UI/UX chưa hoàn thiện | 🟡 TB | Dùng shadcn/ui có sẵn, focus vào UX flow |
| Data demo không đủ thực tế | 🟢 Thấp | Tạo script seed data |
| Firestore security rules | 🟡 TB | Viết rules ngay từ đầu |

---

## 📌 11. CHECKLIST TRƯỚC KHI NỘP (15/04/2026)

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

## 📌 12. GHI CHÚ & CẬP NHẬT

| Ngày | Nội dung | Người cập nhật |
|------|----------|---------------|
| 05/03/2026 | Khởi tạo Review.md - Tổng hợp concept, plan tech stack, timeline | AI Assistant |
| 05/03/2026 | **Phase 0 hoàn tất** - Init project, cài dependencies, setup Tailwind + Firebase config, tạo folder structure, types, services, stores, layout, pages, routing. Build thành công, dev server chạy OK tại `http://localhost:5173` | AI Assistant |
| | | |

---

> **⚠️ LƯU Ý QUAN TRỌNG:**
> - Ưu tiên hoàn thành **MVP (Minimum Viable Product)** trước, rồi mới polish
> - MVP bao gồm: Auth + Job CRUD + Job List + Profile + Dashboard
> - Mỗi tuần nên có 1 buổi sync tiến độ team
> - Commit code thường xuyên, mỗi feature 1 branch riêng
> - Bắt đầu viết report song song với code, ĐỪNG để cuối mới viết
