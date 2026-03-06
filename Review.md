# UniJob (Uni Task Hub) - Project Review & Technology Plan

> **Ngày tạo:** 05/03/2026
> **Deadline nộp bài:** 15/04/2026
> **Target hoàn thành:** 31/03/2026 (buffer 2 tuần trước deadline)
> **Môn học:** Electronic Commerce - CO3027 (HK252)

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Concept
**UniJob** (Uni Task Hub) là nền tảng **thương mại điện tử nội bộ** dành cho cộng đồng đại học, hoạt động theo mô hình **C2C và B2C nội bộ**.

**Mục tiêu:** Số hóa và chuẩn hóa quy trình giao - nhận task/job ngắn hạn trong phạm vi trường đại học, thay thế các kênh phi chính thức (Facebook, Zalo, Email).

### 1.2 Vấn đề giải quyết
| # | Vấn đề | Giải pháp UniJob |
|---|--------|-----------------|
| 1 | Thông tin phân tán, thiếu hệ thống | Hệ thống tập trung với bộ lọc, phân loại, tìm kiếm |
| 2 | Thiếu cơ chế đánh giá năng lực | Hệ thống rating gamification + profile portfolio |
| 3 | Quy trình giao việc không số hóa | Workflow khép kín: Đăng -> Ứng tuyển -> Nhận việc -> Hoàn thành -> Đánh giá |

### 1.3 Đối tượng người dùng
- **Bên đăng task:** Giảng viên, phòng ban, CLB, Đoàn-Hội, sinh viên
- **Bên nhận task:** Sinh viên muốn tích lũy kinh nghiệm, thu nhập, điểm rèn luyện

### 1.4 Mô hình kinh doanh
- **C2C:** Sinh viên <-> Sinh viên (gia sư, hỗ trợ học tập)
- **B2C:** Tổ chức/Giảng viên -> Sinh viên (trợ giảng, nhập liệu, sự kiện)

---

## 2. DANH SÁCH CHỨC NĂNG (TỪ BRAINSTORM)

### 2.1 Chức năng ưu tiên cao (Priority 4-5)
| # | Chức năng | Mô tả | Ưu tiên | Trạng thái Figma |
|---|-----------|-------|---------|------------------|
| 1 | Bộ lọc công việc | Search, filter, pagination | 5 | Done |
| 2 | Thao tác công việc | CRUD job (đăng/sửa/xóa/ứng tuyển) | 5 | Done |
| 3 | Profile cá nhân (Portfolio) | Tên, Khoa, Rating, SĐT, Email | 5 | Done |
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

## 3. YÊU CẦU BÀI TẬP (Assignment Mapping)

| Part | Nội dung | Điểm | Trạng thái |
|------|----------|------|------------|
| **1.1** | Identify Project (Vấn đề, ý tưởng, thị trường, khách hàng) | 0.5 | Đã có (1.1.pdf) |
| **1.2** | Business Model Canvas | 0.5 | Đã có (TMDT_Business Canvas.png) |
| **1.3** | Pricing model, Revenue model | 1.0 | Chưa làm |
| **1.4** | Development plan, estimated cost | 1.0 | Chưa làm |
| **2.1** | UI/UX Design (Figma) | 1.5 | Đã hoàn thành |
| **2.2** | Visual Design principles | 0.5 | Chưa làm |
| **3.1** | Deploy website/app demo | - | Chưa làm |
| **3.2** | Demo code | 2.0 | Chưa làm |
| **4.1** | Video giới thiệu | 1.0 | Chưa làm |
| **4.2** | Report format | 1.0 | Chưa làm |
| **5** | Advanced features (4th wave e-commerce) | 1.0 | Chưa làm |

---

## 4. TECHNOLOGY STACK RECOMMENDATION

### 4.1 Stack đã xác nhận (từ team)

- **Source Control:** GitHub
- **Design:** Figma
- **Frontend:** React.js
- **Backend/DB:** Firebase

### 4.2 Chi tiết Technology Stack

```
Frontend:   React 19 + Vite + TypeScript + Tailwind CSS
            React Router v6 | Zustand | TanStack Query
Backend:    Firebase Auth (Google) | Cloud Firestore | Storage | Hosting
DevOps:     GitHub | Docker + Nginx | ESLint + Prettier
Libraries:  react-hot-toast | jsPDF | date-fns | Lucide React | Framer Motion
```

### 4.3 Giải thích lựa chọn công nghệ

| Công nghệ | Lý do chọn |
|-----------|------------|
| **React + Vite** | Build nhanh, ecosystem lớn, team đã quen |
| **TypeScript** | Type safety, ít bug runtime, IntelliSense tốt |
| **Tailwind CSS** | Rapid prototyping, responsive design dễ dàng |
| **Firebase Auth** | Tích hợp Google Sign-in nhanh, hỗ trợ giới hạn domain email |
| **Firestore** | Realtime sync, NoSQL linh hoạt, free tier đủ dùng cho demo |
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

## 5. KIẾN TRÚC HỆ THỐNG

### 5.1 Folder Structure

```
UniJob/
+-- public/
+-- src/
|   +-- assets/              # Images, fonts
|   +-- components/
|   |   +-- ui/              # shadcn/ui components
|   |   +-- layout/          # Header, Footer, Sidebar
|   |   +-- job/             # Job-related components
|   |   +-- profile/         # Profile components
|   |   +-- common/          # Shared components
|   +-- pages/               # Route pages
|   +-- hooks/               # Custom React hooks
|   +-- lib/                 # firebase.ts, utils.ts, constants.ts
|   +-- services/            # auth, job, user, rating services
|   +-- store/               # Zustand stores
|   +-- types/               # TypeScript types
|   +-- App.tsx
|   +-- main.tsx
|   +-- index.css
+-- functions/               # Firebase Cloud Functions
+-- firestore.rules
+-- firebase.json
+-- package.json
+-- vite.config.ts
+-- README.md
```

### 5.2 Database Schema (Firestore Collections)

```
users/{userId}
  email, displayName, photoURL, faculty, department, studentId,
  phone, bio, skills[], ratingScore, totalRatings,
  activeJobCount, maxJobLimit, isAnonymous, createdAt, updatedAt

jobs/{jobId}
  title, description, category, faculty, isUrgent, isAnonymous,
  payment, paymentType, duration, deadline, maxApplicants,
  status, postedBy, assignedTo[], applicants[], tags[],
  createdAt, updatedAt

applications/{applicationId}
  jobId, applicantId, message, status, createdAt, updatedAt

ratings/{ratingId}
  jobId, fromUserId, toUserId, score, comment, createdAt, type

jobCompletions/{completionId}
  jobId, workerConfirmed, posterConfirmed, completedAt, status

workHistory/{historyId}
  user1, user2, jobId, completedAt, rating
```

---

## 6. PHÂN CÔNG NHÓM & VAI TRÒ

> Figma đã hoàn thành. Lộc chuyển sang tham gia code frontend + documentation.
> Báo cáo: CẢ 5 NGƯỜI cùng viết -- mỗi người viết phần liên quan đến code mình làm.

### 6.1 Thành viên & Vai trò

| # | Thành viên | Vai trò chính | Trách nhiệm |
|---|------------|--------------|-------------|
| 1 | **Nguyễn Minh Hiếu** | **Tech Lead / Full-stack** | Kiến trúc, setup, review code, Firebase config, Auth, CV PDF, AI suggest, deploy |
| 2 | **Thái Bảo Long** | **Frontend Developer 1** | Job CRUD, Job Listing, Job Detail, Anonymous, Polish UI |
| 3 | **Ngô Quang Anh** | **Frontend Developer 2** | Profile, Dashboard, Rating UI, Work History, responsive |
| 4 | **Diệp Vũ Minh** | **Backend/Firebase Developer** | Firestore services, Security Rules, Completion, Job limit, Suggest, Seed data |
| 5 | **Lộc** | **Frontend Developer 3 + Documentation** | Home page, Urgent mode, Notification UI, Layout polish, tổng hợp report, video |

### 6.2 Phân bổ khối lượng (Workload Balance)

```
           Code     Docs     Testing    Tổng
Hiếu  ========..  ==......  ==......   ~55% code / ~20% docs / ~25% review
Long  =========.  =.......  ==......   ~80% code / ~10% docs / ~10% testing
Anh   ========..  ==......  ==......   ~70% code / ~15% docs / ~15% testing
Minh  =========.  ==......  =.......   ~75% code / ~15% docs / ~10% testing
Lộc   =======...  ====....  =.......   ~55% code / ~30% docs / ~15% testing

Cường độ: Sprint pace, ~6 ngày/tuần trong 3.5 tuần
```

### 6.3 Trách nhiệm Assignment Parts (Bài nộp) -- CẢ 5 NGƯỜI CÙNG VIẾT

| Part | Nội dung | Điểm | Người viết chính | Hỗ trợ |
|------|----------|------|-----------------|--------|
| **1.1** | Identify Project | 0.5 | ĐÃ CÓ (1.1.pdf) | -- |
| **1.2** | Business Model Canvas | 0.5 | ĐÃ CÓ (TMDT_Business Canvas.png) | -- |
| **1.3** | Pricing model, Revenue model | 1.0 | Minh + Long | Hiếu |
| **1.4** | Development plan, Estimated cost | 1.0 | Hiếu + Minh | -- |
| **2.1** | UI/UX Design (Figma) | 1.5 | ĐÃ HOÀN THÀNH | -- |
| **2.2** | Visual Design principles | 0.5 | Anh + Lộc | -- |
| **3.1** | Deploy website/app demo | -- | Hiếu | Minh |
| **3.2** | Demo code (mô tả chức năng) | 2.0 | **Cả 5 người** -- mỗi người viết phần mình làm | -- |
| **4.1** | Video giới thiệu sản phẩm | 1.0 | Lộc + Anh | -- |
| **4.2** | Report compile + format | 1.0 | Lộc (tổng hợp) | Cả team review |
| **5** | Advanced features (4th wave) | 1.0 | Hiếu + Minh | Lộc |

### 6.4 Git Branch Strategy & Ownership

```
main                          <- Production (chỉ Hiếu merge)
+-- develop                   <- Integration (team merge PR vào đây)
|   |
|   +-- feature/auth          <- Hiếu: Google Sign-in, auth flow
|   +-- feature/job-crud      <- Long: Đăng/Sửa/Xóa job
|   +-- feature/job-listing   <- Long: Danh sách + Filter + Search
|   +-- feature/job-detail    <- Long: Chi tiết job + Ứng tuyển
|   +-- feature/profile       <- Anh: Profile cá nhân
|   +-- feature/dashboard     <- Anh: Dashboard quản lý
|   +-- feature/rating        <- Anh + Minh: Hệ thống đánh giá
|   +-- feature/home          <- Lộc: Home page (real data, featured jobs)
|   +-- feature/urgent        <- Lộc: Việc khẩn cấp UI + countdown
|   +-- feature/anonymous     <- Long: Đăng job ẩn danh
|   +-- feature/notification  <- Lộc: Notification UI components
|   +-- feature/job-limit     <- Minh: Giới hạn số job
|   +-- feature/job-suggest   <- Minh: Đề xuất job theo khoa
|   +-- feature/completion    <- Minh: Xác nhận hoàn thành 2 bước
|   +-- feature/cancel-policy <- Minh: Chính sách huỷ & phạt
|   +-- feature/work-history  <- Anh: Lịch sử hợp tác
|   +-- feature/cv-pdf        <- Hiếu: In chứng nhận CV
|   +-- feature/ai-suggest    <- Hiếu: AI gợi ý
|   +-- feature/security      <- Minh: Firestore Security Rules
|
+-- docs/report               <- Cả team: Báo cáo & tài liệu
```

---

## 7. DEVELOPMENT PLAN & TIMELINE (NÉN 4 TUẦN -- XONG TRƯỚC 31/03)

> Target: Hoàn thành TOÀN BỘ code + deploy + report + video trước 31/03/2026.
> Buffer 2 tuần (01/04 - 14/04) để fix bug, polish report, bổ sung nếu cần.
> Deadline nộp bài: 15/04/2026.

### Phase 0: Setup (05/03 - 08/03) -- 4 ngày [DONE]

| Task | Assignee | Status |
|------|----------|--------|
| Init React + Vite + TypeScript project | Hiếu | Done |
| Setup Tailwind CSS | Hiếu | Done |
| Setup Firebase project (Auth, Firestore, Hosting) | Hiếu | Done (config sẵn, cần điền key) |
| Config ESLint + Prettier | Hiếu | Done |
| Setup GitHub repo + branch strategy | Hiếu | Done |
| Tạo folder structure + scaffold code | Hiếu | Done |
| Docker + CI/CD setup | Hiếu | Done |

---

### Sprint 1: Foundation + Core (09/03 - 15/03) -- 7 ngày

Mục tiêu: Auth chạy được, Job CRUD hoạt động, Profile + Home kết nối real data.

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| Tạo Firebase project trên Console, điền API keys | Hiếu | main | P0 | -- |
| **Authentication** - Google Sign-in, restrict @hcmut.edu.vn, auth guard | Hiếu | feature/auth | P0 | -- |
| **Job CRUD** - Form đăng job, sửa job, xóa job (kết nối Firestore) | Long | feature/job-crud | P0 | -- |
| **Profile** - Trang cá nhân, chỉnh sửa thông tin, avatar | Anh | feature/profile | P0 | -- |
| **Firestore indexes** + cấu trúc collection theo schema | Minh | feature/security | P0 | -- |
| **Home page** - Kết nối real data (featured jobs, stats, categories) | Lộc | feature/home | P0 | -- |
| Bắt đầu viết Part 1.3 báo cáo (Pricing, Revenue) | Minh + Long | docs/report | P1 | -- |

> **Milestone M1 (15/03):** Auth + Job CRUD + Profile + Home chạy được với real data

---

### Sprint 2: Full Features (16/03 - 22/03) -- 7 ngày

Mục tiêu: Tất cả 13 chức năng hoạt động. MVP hoàn chỉnh.

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **Job Listing** - Danh sách + Filter + Search + Pagination (real data) | Long | feature/job-listing | P0 | -- |
| **Job Detail** - Trang chi tiết + nút ứng tuyển + quản lý ứng viên | Long | feature/job-detail | P0 | -- |
| **Đăng job ẩn danh** - Toggle ẩn danh, hiển thị "Ẩn danh" thay tên | Long | feature/anonymous | P1 | -- |
| **Dashboard** - Tab job đã đăng / đã ứng tuyển (real data) | Anh | feature/dashboard | P0 | -- |
| **Rating system** - UI đánh giá sao + comment sau hoàn thành job | Anh | feature/rating | P1 | -- |
| **Lịch sử hợp tác** - UI danh sách partner, gợi ý partner cũ | Anh | feature/work-history | P2 | -- |
| **Việc khẩn cấp** - Urgent mode UI + countdown timer + filter | Lộc | feature/urgent | P1 | -- |
| **Notification UI** - Toast + dropdown thông báo job mới, ứng tuyển | Lộc | feature/notification | P1 | -- |
| **Layout polish** - Responsive mobile, loading states, error handling | Lộc | develop | P1 | -- |
| **Xác nhận hoàn thành 2 bước** - Worker confirm + Poster confirm | Minh | feature/completion | P1 | -- |
| **Giới hạn số job đang nhận** - Logic check + hiển thị cảnh báo | Minh | feature/job-limit | P1 | -- |
| **Đề xuất job theo khoa/ngành** - Algorithm + UI "Gợi ý cho bạn" | Minh | feature/job-suggest | P1 | -- |
| Rating service: submitRating, tính avg, cập nhật user score | Minh | feature/rating | P1 | -- |
| Firestore basic Security Rules (auth required, owner check) | Minh | feature/security | P0 | -- |
| Review code & merge PRs vào develop | Hiếu | develop | P0 | -- |
| Integration test auth flow + job flow end-to-end | Hiếu | develop | P0 | -- |
| Hoàn thành Part 1.3 (Pricing + Revenue model) | Minh + Long | docs/report | P1 | -- |

> **Milestone M2 (22/03):** Tất cả 13 chức năng hoạt động -- Rating, Urgent, Anonymous, Job limit, Suggest, Completion, Work history. MVP hoàn chỉnh.

---

### Sprint 3: Advanced + Polish + Deploy (23/03 - 28/03) -- 6 ngày

Mục tiêu: Advanced features xong, deploy lên production, code freeze.

| Task | Assignee | Branch | Ưu tiên | Status |
|------|----------|--------|---------|--------|
| **In chứng nhận CV Passport** - Xuất PDF với jsPDF | Hiếu | feature/cv-pdf | P2 | -- |
| **AI Job Matching** - Algorithm gợi ý dựa trên skills + history | Hiếu | feature/ai-suggest | P2 | -- |
| **Chính sách huỷ & phạt uy tín** - Logic trừ điểm, UI xác nhận huỷ | Minh | feature/cancel-policy | P2 | -- |
| **Firestore Security Rules** hoàn chỉnh (production-ready) | Minh | feature/security | P1 | -- |
| **Real-time notifications** - Firestore onSnapshot cho job mới | Minh | feature/security | P2 | -- |
| **Testing toàn bộ flow** - Test tất cả chức năng, fix bugs | Long + Lộc | develop | P0 | -- |
| **Performance** - Lazy loading, code splitting, image optimization | Long | develop | P2 | -- |
| **Responsive final check** - Test trên mobile, tablet, desktop | Anh | develop | P1 | -- |
| Deploy lên Firebase Hosting | Hiếu | main | P0 | -- |
| Tạo script seed demo data (20+ jobs, 10+ users, ratings) | Minh | -- | P0 | -- |
| Mỗi người viết mô tả feature của mình cho Part 3.2 | Cả team | docs/report | P1 | -- |
| Viết Part 1.4 (Dev plan + Estimated cost) | Hiếu + Minh | docs/report | P1 | -- |
| Viết Part 2.2 (Visual Design principles) | Anh + Lộc | docs/report | P1 | -- |
| Viết Part 5 (Advanced features documentation) | Hiếu + Minh | docs/report | P1 | -- |

> **Milestone M3 (28/03):** Code freeze. Deploy lên production. Report draft xong 80%.

---

### Sprint 4: Report + Video + Final (29/03 - 31/03) -- 3 ngày

Mục tiêu: Hoàn thành BÁO CÁO, VIDEO, DEMO DATA. Xong hết.

| Task | Assignee | Deadline | Ưu tiên | Status |
|------|----------|----------|---------|--------|
| Nhập demo data lên production | Minh + Long | 29/03 | P0 | -- |
| Tổng hợp report Part 1-5, format đẹp | Lộc | 30/03 | P0 | -- |
| Cả team review report, chỉnh sửa | Cả team | 30/03 | P0 | -- |
| Quay video demo sản phẩm (3-5 phút) | Lộc + Anh | 31/03 | P0 | -- |
| Final testing trên production | Cả team | 31/03 | P0 | -- |
| **HOÀN THÀNH TOÀN BỘ** | Cả team | **31/03** | --- | -- |

> **Milestone M4 (31/03):** XONG HẾT -- Code + Deploy + Report + Video + Demo data.

---

### Buffer (01/04 - 14/04) -- 2 tuần dự phòng

Thời gian này KHÔNG lập kế hoạch công việc mới. Chỉ dùng khi:
- Fix bug nghiêm trọng phát hiện sau khi deploy
- Bổ sung/chỉnh sửa report theo feedback
- Polish thêm UI nếu còn thời gian
- Chuẩn bị cho buổi trình bày/demo nếu có

> **NỘP BÀI: 15/04/2026**

---

## 8. TỔNG HỢP CÔNG VIỆC THEO THÀNH VIÊN

### Nguyễn Minh Hiếu (Tech Lead)

| Sprint | Công việc chính | Báo cáo |
|--------|----------------|---------|
| S1 (09-15/03) | Firebase Console setup, Authentication, code review | -- |
| S2 (16-22/03) | Review code, merge PRs, integration test E2E | -- |
| S3 (23-28/03) | CV PDF export, AI Job Matching, Deploy Firebase | Part 1.4 + Part 5 |
| S4 (29-31/03) | Final testing, review report | Review report |

### Thái Bảo Long (Frontend Dev 1)

| Sprint | Công việc chính | Báo cáo |
|--------|----------------|---------|
| S1 (09-15/03) | Job CRUD -- form đăng/sửa/xóa job | Part 1.3 (cùng Minh) |
| S2 (16-22/03) | Job Listing + Job Detail + Anonymous toggle | Hoàn thành Part 1.3 |
| S3 (23-28/03) | Testing toàn bộ flow, performance optimization | Mô tả Job features cho Part 3.2 |
| S4 (29-31/03) | Nhập demo data, final testing | Review report |

### Ngô Quang Anh (Frontend Dev 2)

| Sprint | Công việc chính | Báo cáo |
|--------|----------------|---------|
| S1 (09-15/03) | Profile page (chỉnh sửa, avatar) | -- |
| S2 (16-22/03) | Dashboard + Rating UI + Work History | -- |
| S3 (23-28/03) | Responsive final check, fix bugs | Part 2.2 + Mô tả Dashboard/Profile/Rating cho Part 3.2 |
| S4 (29-31/03) | Quay video demo, final testing | Review report |

### Diệp Vũ Minh (Backend/Firebase Dev)

| Sprint | Công việc chính | Báo cáo |
|--------|----------------|---------|
| S1 (09-15/03) | Firestore indexes + collection structure | Part 1.3 (cùng Long) |
| S2 (16-22/03) | Completion + Job limit + Rating service + Suggest + Security Rules | Hoàn thành Part 1.3 |
| S3 (23-28/03) | Cancel policy + Security Rules final + Realtime notifications + Seed data | Part 1.4 + Part 5 + Mô tả backend cho Part 3.2 |
| S4 (29-31/03) | Nhập demo data, final testing | Review report |

### Lộc (Frontend Dev 3 + Docs)

| Sprint | Công việc chính | Báo cáo |
|--------|----------------|---------|
| S1 (09-15/03) | Home page (real data, featured jobs, stats) | -- |
| S2 (16-22/03) | Urgent mode UI + Notification UI + Layout polish | -- |
| S3 (23-28/03) | Testing + fix bugs | Part 2.2 (cùng Anh) + Mô tả Home/Urgent/Notification cho Part 3.2 |
| S4 (29-31/03) | Tổng hợp report + format + quay video demo | Tổng hợp + format report |

---

## 9. QUY TẮC LÀM VIỆC NHÓM

### 9.1 Communication
- **Group chat:** Zalo/Discord -- cập nhật tiến độ hàng ngày
- **Sync meeting:** Mỗi tuần 1 buổi (Chủ nhật tối) -- review tiến độ, demo, plan tuần sau
- **Urgent issues:** Tag @all trong group chat

### 9.2 Git Rules
- KHÔNG push trực tiếp vào main -- chỉ Hiếu merge từ develop
- Mỗi feature 1 branch riêng: feature/tên-feature
- Tạo Pull Request (PR) khi hoàn thành feature
- Ít nhất 1 người review PR trước khi merge vào develop
- Commit message format: feat:, fix:, docs:, style:, refactor:
- Commit thường xuyên (mỗi ngày ít nhất 1 commit khi đang code)

### 9.3 Code Standards
- TypeScript strict mode
- Tailwind CSS cho styling (không dùng CSS thuần)
- Component naming: PascalCase (JobCard.tsx)
- File naming: camelCase cho services/utils (job.service.ts)
- Mỗi component < 200 dòng -> tách nhỏ nếu lớn hơn

### 9.4 Deadline nội bộ

| Mốc | Ngày | Nội dung | Check bởi |
|-----|------|----------|-----------|
| M1 | **15/03** | Auth + Job CRUD + Profile + Home chạy được | Hiếu |
| M2 | **22/03** | Tất cả 13 chức năng hoạt động (MVP hoàn chỉnh) | Cả team |
| M3 | **28/03** | Code freeze + Deploy + Report draft 80% | Hiếu |
| M4 | **31/03** | XONG HẾT: Report + Video + Demo data | Cả team |
| -- | 01/04-14/04 | Buffer: fix bug, polish, bổ sung | Khi cần |
| NỘP | **15/04** | Deadline nộp bài | Cả team |

---

## 10. SETUP GUIDE (STEP-BY-STEP)

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
1. Tạo project mới trên Firebase Console (https://console.firebase.google.com)
2. Enable Authentication -> Google provider
3. Giới hạn domain email: chỉ cho phép @hcmut.edu.vn
4. Tạo Firestore Database (start in test mode, sau đó thêm rules)
5. Enable Storage cho upload ảnh profile
6. Setup Hosting

### Bước 5: Git Workflow
```
main          <- Production (deploy)
+-- develop   <- Integration branch
    +-- feature/auth, feature/job-crud, feature/profile, ...
```

---

## 11. ADVANCED FEATURES (4TH WAVE E-COMMERCE)

Để đạt điểm Part 5 (1 điểm), đề xuất các tính năng thuộc làn sóng thứ 4 của TMĐT:

| Feature | Mô tả | Công nghệ |
|---------|--------|-----------|
| **AI Job Matching** | Gợi ý job phù hợp dựa trên profile, kỹ năng, lịch sử | Firebase ML / Simple algorithm |
| **Real-time Notifications** | Thông báo tức thời khi có job mới, ứng tuyển | Firestore onSnapshot |
| **Social Proof & Gamification** | Badge, level, leaderboard uy tín | Custom scoring system |
| **Progressive Web App (PWA)** | Cài đặt như app native, offline support | Vite PWA plugin |
| **Smart Search** | Tìm kiếm ngữ nghĩa, auto-suggest | Algolia / Firestore index |

---

## 12. ƯỚC TÍNH CHI PHÍ

| Hạng mục | Chi phí | Ghi chú |
|----------|---------|---------|
| Firebase (Spark Plan) | **$0** | Free tier đủ cho demo |
| Domain (.com) | ~$12/năm | Tùy chọn, có thể dùng firebase URL |
| Figma | **$0** | Free cho education |
| GitHub | **$0** | Free |
| Vercel Hosting (backup) | **$0** | Free tier |
| **Tổng chi phí demo** | **$0 - $12** | |

---

## 13. RỦI RO & GIẢI PHÁP

| Rủi ro | Mức độ | Giải pháp |
|--------|--------|-----------|
| Timeline gấp (25 ngày làm việc) | Cao | Sprint pace, mỗi người làm song song, cắt scope nếu cần |
| Team chưa quen Firebase | TB | Pair programming, tutorial sessions |
| UI/UX chưa hoàn thiện | TB | Dùng Tailwind + component sẵn, focus vào UX flow |
| Data demo không đủ thực tế | Thấp | Tạo script seed data |
| Firestore security rules | TB | Viết rules ngay từ đầu |

---

## 14. CHECKLIST TRƯỚC KHI NỘP (15/04/2026)

- [ ] **Part 1.1:** Identify project (đã có)
- [ ] **Part 1.2:** Business Model Canvas (đã có)
- [ ] **Part 1.3:** Pricing model + Revenue model
- [ ] **Part 1.4:** Development plan + Estimated cost
- [ ] **Part 2.1:** UI/UX Figma hoàn chỉnh (đã có)
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

## 15. GHI CHÚ & CẬP NHẬT

| Ngày | Nội dung | Người cập nhật |
|------|----------|---------------|
| 05/03/2026 | Khởi tạo Review.md - Tổng hợp concept, plan tech stack, timeline | AI Assistant |
| 05/03/2026 | Phase 0 hoàn tất - Init project, cài dependencies, setup Tailwind + Firebase config, tạo folder structure, types, services, stores, layout, pages, routing. Build thành công, dev server chạy OK tại http://localhost:5173 | AI Assistant |
| 06/03/2026 | Phân công nhóm 5 người - Thêm Section 6-9: vai trò, phân công, git branch ownership, quy tắc nhóm | AI Assistant |
| 06/03/2026 | Chia lại khối lượng - Figma đã xong, Lộc chuyển thành Frontend Dev 3 + Docs, nhận code: Home page, Urgent, Notification UI, Layout polish | AI Assistant |
| 06/03/2026 | Nén timeline 4 tuần - Từ 6 tuần (đến 14/04) thành 4 sprint (đến 31/03). Bỏ icon/emoji toàn bộ. Chia báo cáo cho cả 5 người viết. Buffer 2 tuần trước deadline. | AI Assistant |
| 06/03/2026 | Chuyển toàn bộ sang tiếng Việt có dấu | AI Assistant |
| | | |

---

> **LƯU Ý QUAN TRỌNG:**
> - Ưu tiên hoàn thành MVP trước, rồi mới polish
> - MVP bao gồm: Auth + Job CRUD + Job List + Profile + Dashboard
> - Mỗi tuần 1 buổi sync tiến độ team
> - Commit code thường xuyên, mỗi feature 1 branch riêng
> - Báo cáo: MỖI NGƯỜI viết phần liên quan đến code mình, Lộc tổng hợp + format
> - TARGET: XONG HẾT TRƯỚC 31/03 -- còn 2 tuần buffer trước deadline
