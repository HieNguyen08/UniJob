# UniJob (Uni Task Hub) - Project Review & Technology Plan

> **Ngay tao:** 05/03/2026
> **Deadline nop bai:** 15/04/2026
> **Target hoan thanh:** 31/03/2026 (buffer 2 tuan truoc deadline)
> **Mon hoc:** Electronic Commerce - CO3027 (HK252)

---

## 1. TONG QUAN DU AN

### 1.1 Concept
**UniJob** (Uni Task Hub) la nen tang **thuong mai dien tu noi bo** danh cho cong dong dai hoc, hoat dong theo mo hinh **C2C va B2C noi bo**.

**Muc tieu:** So hoa va chuan hoa quy trinh giao - nhan task/job ngan han trong pham vi truong dai hoc, thay the cac kenh phi chinh thuc (Facebook, Zalo, Email).

### 1.2 Van de giai quyet
| # | Van de | Giai phap UniJob |
|---|--------|-----------------|
| 1 | Thong tin phan tan, thieu he thong | He thong tap trung voi bo loc, phan loai, tim kiem |
| 2 | Thieu co che danh gia nang luc | He thong rating gamification + profile portfolio |
| 3 | Quy trinh giao viec khong so hoa | Workflow khep kin: Dang -> Ung tuyen -> Nhan viec -> Hoan thanh -> Danh gia |

### 1.3 Doi tuong nguoi dung
- **Ben dang task:** Giang vien, phong ban, CLB, Doan-Hoi, sinh vien
- **Ben nhan task:** Sinh vien muon tich luy kinh nghiem, thu nhap, diem ren luyen

### 1.4 Mo hinh kinh doanh
- **C2C:** Sinh vien <-> Sinh vien (gia su, ho tro hoc tap)
- **B2C:** To chuc/Giang vien -> Sinh vien (tro giang, nhap lieu, su kien)

---

## 2. DANH SACH CHUC NANG (TU BRAINSTORM)

### 2.1 Chuc nang uu tien cao (Priority 4-5)
| # | Chuc nang | Mo ta | Uu tien | Trang thai Figma |
|---|-----------|-------|---------|------------------|
| 1 | Bo loc cong viec | Search, filter, pagination | 5 | Done |
| 2 | Thao tac cong viec | CRUD job (dang/sua/xoa/ung tuyen) | 5 | Done |
| 3 | Profile ca nhan (Portfolio) | Ten, Khoa, Rating, SDT, Email | 5 | Done |
| 4 | Dang nhap Google (mail truong) | Xac thuc qua email sinh vien | 5 | Done |
| 5 | Gioi han so job dang nhan | Anti om viec, dua tren diem uy tin | 5 | Done |
| 6 | Dang job an danh | An danh nhung van xac thuc sinh vien | 5 | Done |
| 7 | Viec khan cap | Nut bam cho nhu cau 30 phut - 1 tieng | 4 | Done |
| 8 | De xuat job theo khoa/nganh | Uu tien hien thi job cung khoa | 4 | Done |

### 2.2 Chuc nang uu tien trung binh (Priority 2-3)
| # | Chuc nang | Mo ta | Uu tien | Trang thai Figma |
|---|-----------|-------|---------|------------------|
| 9 | Danh gia Gamification | Thang diem uy tin tu lich su cong viec | 3 | Done |
| 10 | Chinh sach huy & phat uy tin | Co che huy job co dieu kien, tru diem | 3 | Done |
| 11 | Lich su hop tac (Work History Pair) | Luu & goi y partner da tung hop tac | 3 | Done |
| 12 | Xac nhan hoan thanh 2 buoc | Nguoi lam + Nguoi dang deu xac nhan | 2 | Done |

### 2.3 Chuc nang nang cao (Priority 1) - Phase 2
| # | Chuc nang | Mo ta | Uu tien |
|---|-----------|-------|---------|
| 13 | In chung nhan CV Passport | Xuat PDF chung nhan kinh nghiem | 1 |

---

## 3. YEU CAU BAI TAP (Assignment Mapping)

| Part | Noi dung | Diem | Trang thai |
|------|----------|------|------------|
| **1.1** | Identify Project (Van de, y tuong, thi truong, khach hang) | 0.5 | Da co (1.1.pdf) |
| **1.2** | Business Model Canvas | 0.5 | Da co (TMDT_Business Canvas.png) |
| **1.3** | Pricing model, Revenue model | 1.0 | Chua lam |
| **1.4** | Development plan, estimated cost | 1.0 | Chua lam |
| **2.1** | UI/UX Design (Figma) | 1.5 | Da hoan thanh |
| **2.2** | Visual Design principles | 0.5 | Chua lam |
| **3.1** | Deploy website/app demo | - | Chua lam |
| **3.2** | Demo code | 2.0 | Chua lam |
| **4.1** | Video gioi thieu | 1.0 | Chua lam |
| **4.2** | Report format | 1.0 | Chua lam |
| **5** | Advanced features (4th wave e-commerce) | 1.0 | Chua lam |

---

## 4. TECHNOLOGY STACK RECOMMENDATION

### 4.1 Stack da xac nhan (tu team)

- **Source Control:** GitHub
- **Design:** Figma
- **Frontend:** React.js
- **Backend/DB:** Firebase

### 4.2 Chi tiet Technology Stack

```
Frontend:   React 19 + Vite + TypeScript + Tailwind CSS
            React Router v6 | Zustand | TanStack Query
Backend:    Firebase Auth (Google) | Cloud Firestore | Storage | Hosting
DevOps:     GitHub | Docker + Nginx | ESLint + Prettier
Libraries:  react-hot-toast | jsPDF | date-fns | Lucide React | Framer Motion
```

### 4.3 Giai thich lua chon cong nghe

| Cong nghe | Ly do chon |
|-----------|------------|
| **React + Vite** | Build nhanh, ecosystem lon, team da quen |
| **TypeScript** | Type safety, it bug runtime, IntelliSense tot |
| **Tailwind CSS** | Rapid prototyping, responsive design de dang |
| **Firebase Auth** | Tich hop Google Sign-in nhanh, ho tro gioi han domain email |
| **Firestore** | Realtime sync, NoSQL linh hoat, free tier du dung cho demo |
| **Zustand** | State management nhe, don gian hon Redux |

### 4.4 Firebase Free Tier (Spark Plan) - Du cho Demo
| Service | Free Limit | Du kien su dung |
|---------|-----------|-----------------|
| Auth | 10K users/month | Du (demo < 100 users) |
| Firestore | 1GB storage, 50K reads/day | Du |
| Hosting | 10GB transfer/month | Du |
| Storage | 5GB | Du |
| Functions | 2M invocations/month | Du |

---

## 5. KIEN TRUC HE THONG

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

## 6. PHAN CONG NHOM & VAI TRO

> Figma da hoan thanh. Loc chuyen sang tham gia code frontend + documentation.
> Bao cao: CA 5 NGUOI cung viet -- moi nguoi viet phan lien quan den code minh lam.

### 6.1 Thanh vien & Vai tro

| # | Thanh vien | Vai tro chinh | Trach nhiem |
|---|------------|--------------|-------------|
| 1 | **Nguyen Minh Hieu** | **Tech Lead / Full-stack** | Kien truc, setup, review code, Firebase config, Auth, CV PDF, AI suggest, deploy |
| 2 | **Thai Bao Long** | **Frontend Developer 1** | Job CRUD, Job Listing, Job Detail, Anonymous, Polish UI |
| 3 | **Ngo Quang Anh** | **Frontend Developer 2** | Profile, Dashboard, Rating UI, Work History, responsive |
| 4 | **Diep Vu Minh** | **Backend/Firebase Developer** | Firestore services, Security Rules, Completion, Job limit, Suggest, Seed data |
| 5 | **Loc** | **Frontend Developer 3 + Documentation** | Home page, Urgent mode, Notification UI, Layout polish, tong hop report, video |

### 6.2 Phan bo khoi luong (Workload Balance)

```
           Code     Docs     Testing    Tong
Hieu  ========..  ==......  ==......   ~55% code / ~20% docs / ~25% review
Long  =========.  =.......  ==......   ~80% code / ~10% docs / ~10% testing
Anh   ========..  ==......  ==......   ~70% code / ~15% docs / ~15% testing
Minh  =========.  ==......  =.......   ~75% code / ~15% docs / ~10% testing
Loc   =======...  ====....  =.......   ~55% code / ~30% docs / ~15% testing

Cuong do: Sprint pace, ~6 ngay/tuan trong 3.5 tuan
```

### 6.3 Trach nhiem Assignment Parts (Bai nop) -- CA 5 NGUOI CUNG VIET

| Part | Noi dung | Diem | Nguoi viet chinh | Ho tro |
|------|----------|------|-----------------|--------|
| **1.1** | Identify Project | 0.5 | DA CO (1.1.pdf) | -- |
| **1.2** | Business Model Canvas | 0.5 | DA CO (TMDT_Business Canvas.png) | -- |
| **1.3** | Pricing model, Revenue model | 1.0 | Minh + Long | Hieu |
| **1.4** | Development plan, Estimated cost | 1.0 | Hieu + Minh | -- |
| **2.1** | UI/UX Design (Figma) | 1.5 | DA HOAN THANH | -- |
| **2.2** | Visual Design principles | 0.5 | Anh + Loc | -- |
| **3.1** | Deploy website/app demo | -- | Hieu | Minh |
| **3.2** | Demo code (mo ta chuc nang) | 2.0 | **Ca 5 nguoi** -- moi nguoi viet phan minh lam | -- |
| **4.1** | Video gioi thieu san pham | 1.0 | Loc + Anh | -- |
| **4.2** | Report compile + format | 1.0 | Loc (tong hop) | Ca team review |
| **5** | Advanced features (4th wave) | 1.0 | Hieu + Minh | Loc |

### 6.4 Git Branch Strategy & Ownership

```
main                          <- Production (chi Hieu merge)
+-- develop                   <- Integration (team merge PR vao day)
|   |
|   +-- feature/auth          <- Hieu: Google Sign-in, auth flow
|   +-- feature/job-crud      <- Long: Dang/Sua/Xoa job
|   +-- feature/job-listing   <- Long: Danh sach + Filter + Search
|   +-- feature/job-detail    <- Long: Chi tiet job + Ung tuyen
|   +-- feature/profile       <- Anh: Profile ca nhan
|   +-- feature/dashboard     <- Anh: Dashboard quan ly
|   +-- feature/rating        <- Anh + Minh: He thong danh gia
|   +-- feature/home          <- Loc: Home page (real data, featured jobs)
|   +-- feature/urgent        <- Loc: Viec khan cap UI + countdown
|   +-- feature/anonymous     <- Long: Dang job an danh
|   +-- feature/notification  <- Loc: Notification UI components
|   +-- feature/job-limit     <- Minh: Gioi han so job
|   +-- feature/job-suggest   <- Minh: De xuat job theo khoa
|   +-- feature/completion    <- Minh: Xac nhan hoan thanh 2 buoc
|   +-- feature/cancel-policy <- Minh: Chinh sach huy & phat
|   +-- feature/work-history  <- Anh: Lich su hop tac
|   +-- feature/cv-pdf        <- Hieu: In chung nhan CV
|   +-- feature/ai-suggest    <- Hieu: AI goi y
|   +-- feature/security      <- Minh: Firestore Security Rules
|
+-- docs/report               <- Ca team: Bao cao & tai lieu
```

---

## 7. DEVELOPMENT PLAN & TIMELINE (NEN 4 TUAN -- XONG TRUOC 31/03)

> Target: Hoan thanh TOAN BO code + deploy + report + video truoc 31/03/2026.
> Buffer 2 tuan (01/04 - 14/04) de fix bug, polish report, bo sung neu can.
> Deadline nop bai: 15/04/2026.

### Phase 0: Setup (05/03 - 08/03) -- 4 ngay [DONE]

| Task | Assignee | Status |
|------|----------|--------|
| Init React + Vite + TypeScript project | Hieu | Done |
| Setup Tailwind CSS | Hieu | Done |
| Setup Firebase project (Auth, Firestore, Hosting) | Hieu | Done (config san, can dien key) |
| Config ESLint + Prettier | Hieu | Done |
| Setup GitHub repo + branch strategy | Hieu | Done |
| Tao folder structure + scaffold code | Hieu | Done |
| Docker + CI/CD setup | Hieu | Done |

---

### Sprint 1: Foundation + Core (09/03 - 15/03) -- 7 ngay

Muc tieu: Auth chay duoc, Job CRUD hoat dong, Profile + Home ket noi real data.

| Task | Assignee | Branch | Uu tien | Status |
|------|----------|--------|---------|--------|
| Tao Firebase project tren Console, dien API keys | Hieu | main | P0 | -- |
| **Authentication** - Google Sign-in, restrict @hcmut.edu.vn, auth guard | Hieu | feature/auth | P0 | -- |
| **Job CRUD** - Form dang job, sua job, xoa job (ket noi Firestore) | Long | feature/job-crud | P0 | -- |
| **Profile** - Trang ca nhan, chinh sua thong tin, avatar | Anh | feature/profile | P0 | -- |
| **Firestore indexes** + cau truc collection theo schema | Minh | feature/security | P0 | -- |
| **Home page** - Ket noi real data (featured jobs, stats, categories) | Loc | feature/home | P0 | -- |
| Bat dau viet Part 1.3 bao cao (Pricing, Revenue) | Minh + Long | docs/report | P1 | -- |

> **Milestone M1 (15/03):** Auth + Job CRUD + Profile + Home chay duoc voi real data

---

### Sprint 2: Full Features (16/03 - 22/03) -- 7 ngay

Muc tieu: Tat ca 13 chuc nang hoat dong. MVP hoan chinh.

| Task | Assignee | Branch | Uu tien | Status |
|------|----------|--------|---------|--------|
| **Job Listing** - Danh sach + Filter + Search + Pagination (real data) | Long | feature/job-listing | P0 | -- |
| **Job Detail** - Trang chi tiet + nut ung tuyen + quan ly ung vien | Long | feature/job-detail | P0 | -- |
| **Dang job an danh** - Toggle an danh, hien thi "An danh" thay ten | Long | feature/anonymous | P1 | -- |
| **Dashboard** - Tab job da dang / da ung tuyen (real data) | Anh | feature/dashboard | P0 | -- |
| **Rating system** - UI danh gia sao + comment sau hoan thanh job | Anh | feature/rating | P1 | -- |
| **Lich su hop tac** - UI danh sach partner, goi y partner cu | Anh | feature/work-history | P2 | -- |
| **Viec khan cap** - Urgent mode UI + countdown timer + filter | Loc | feature/urgent | P1 | -- |
| **Notification UI** - Toast + dropdown thong bao job moi, ung tuyen | Loc | feature/notification | P1 | -- |
| **Layout polish** - Responsive mobile, loading states, error handling | Loc | develop | P1 | -- |
| **Xac nhan hoan thanh 2 buoc** - Worker confirm + Poster confirm | Minh | feature/completion | P1 | -- |
| **Gioi han so job dang nhan** - Logic check + hien thi canh bao | Minh | feature/job-limit | P1 | -- |
| **De xuat job theo khoa/nganh** - Algorithm + UI "Goi y cho ban" | Minh | feature/job-suggest | P1 | -- |
| Rating service: submitRating, tinh avg, cap nhat user score | Minh | feature/rating | P1 | -- |
| Firestore basic Security Rules (auth required, owner check) | Minh | feature/security | P0 | -- |
| Review code & merge PRs vao develop | Hieu | develop | P0 | -- |
| Integration test auth flow + job flow end-to-end | Hieu | develop | P0 | -- |
| Hoan thanh Part 1.3 (Pricing + Revenue model) | Minh + Long | docs/report | P1 | -- |

> **Milestone M2 (22/03):** Tat ca 13 chuc nang hoat dong -- Rating, Urgent, Anonymous, Job limit, Suggest, Completion, Work history. MVP hoan chinh.

---

### Sprint 3: Advanced + Polish + Deploy (23/03 - 28/03) -- 6 ngay

Muc tieu: Advanced features xong, deploy len production, code freeze.

| Task | Assignee | Branch | Uu tien | Status |
|------|----------|--------|---------|--------|
| **In chung nhan CV Passport** - Xuat PDF voi jsPDF | Hieu | feature/cv-pdf | P2 | -- |
| **AI Job Matching** - Algorithm goi y dua tren skills + history | Hieu | feature/ai-suggest | P2 | -- |
| **Chinh sach huy & phat uy tin** - Logic tru diem, UI xac nhan huy | Minh | feature/cancel-policy | P2 | -- |
| **Firestore Security Rules** hoan chinh (production-ready) | Minh | feature/security | P1 | -- |
| **Real-time notifications** - Firestore onSnapshot cho job moi | Minh | feature/security | P2 | -- |
| **Testing toan bo flow** - Test tat ca chuc nang, fix bugs | Long + Loc | develop | P0 | -- |
| **Performance** - Lazy loading, code splitting, image optimization | Long | develop | P2 | -- |
| **Responsive final check** - Test tren mobile, tablet, desktop | Anh | develop | P1 | -- |
| Deploy len Firebase Hosting | Hieu | main | P0 | -- |
| Tao script seed demo data (20+ jobs, 10+ users, ratings) | Minh | -- | P0 | -- |
| Moi nguoi viet mo ta feature cua minh cho Part 3.2 | Ca team | docs/report | P1 | -- |
| Viet Part 1.4 (Dev plan + Estimated cost) | Hieu + Minh | docs/report | P1 | -- |
| Viet Part 2.2 (Visual Design principles) | Anh + Loc | docs/report | P1 | -- |
| Viet Part 5 (Advanced features documentation) | Hieu + Minh | docs/report | P1 | -- |

> **Milestone M3 (28/03):** Code freeze. Deploy len production. Report draft xong 80%.

---

### Sprint 4: Report + Video + Final (29/03 - 31/03) -- 3 ngay

Muc tieu: Hoan thanh BAO CAO, VIDEO, DEMO DATA. Xong het.

| Task | Assignee | Deadline | Uu tien | Status |
|------|----------|----------|---------|--------|
| Nhap demo data len production | Minh + Long | 29/03 | P0 | -- |
| Tong hop report Part 1-5, format dep | Loc | 30/03 | P0 | -- |
| Ca team review report, chinh sua | Ca team | 30/03 | P0 | -- |
| Quay video demo san pham (3-5 phut) | Loc + Anh | 31/03 | P0 | -- |
| Final testing tren production | Ca team | 31/03 | P0 | -- |
| **HOAN THANH TOAN BO** | Ca team | **31/03** | --- | -- |

> **Milestone M4 (31/03):** XONG HET -- Code + Deploy + Report + Video + Demo data.

---

### Buffer (01/04 - 14/04) -- 2 tuan du phong

Thoi gian nay KHONG lap ke hoach cong viec moi. Chi dung khi:
- Fix bug nghiem trong phat hien sau khi deploy
- Bo sung/chinh sua report theo feedback
- Polish them UI neu con thoi gian
- Chuan bi cho buoi trinh bay/demo neu co

> **NOP BAI: 15/04/2026**

---

## 8. TONG HOP CONG VIEC THEO THANH VIEN

### Nguyen Minh Hieu (Tech Lead)

| Sprint | Cong viec chinh | Bao cao |
|--------|----------------|---------|
| S1 (09-15/03) | Firebase Console setup, Authentication, code review | -- |
| S2 (16-22/03) | Review code, merge PRs, integration test E2E | -- |
| S3 (23-28/03) | CV PDF export, AI Job Matching, Deploy Firebase | Part 1.4 + Part 5 |
| S4 (29-31/03) | Final testing, review report | Review report |

### Thai Bao Long (Frontend Dev 1)

| Sprint | Cong viec chinh | Bao cao |
|--------|----------------|---------|
| S1 (09-15/03) | Job CRUD -- form dang/sua/xoa job | Part 1.3 (cung Minh) |
| S2 (16-22/03) | Job Listing + Job Detail + Anonymous toggle | Hoan thanh Part 1.3 |
| S3 (23-28/03) | Testing toan bo flow, performance optimization | Mo ta Job features cho Part 3.2 |
| S4 (29-31/03) | Nhap demo data, final testing | Review report |

### Ngo Quang Anh (Frontend Dev 2)

| Sprint | Cong viec chinh | Bao cao |
|--------|----------------|---------|
| S1 (09-15/03) | Profile page (chinh sua, avatar) | -- |
| S2 (16-22/03) | Dashboard + Rating UI + Work History | -- |
| S3 (23-28/03) | Responsive final check, fix bugs | Part 2.2 + Mo ta Dashboard/Profile/Rating cho Part 3.2 |
| S4 (29-31/03) | Quay video demo, final testing | Review report |

### Diep Vu Minh (Backend/Firebase Dev)

| Sprint | Cong viec chinh | Bao cao |
|--------|----------------|---------|
| S1 (09-15/03) | Firestore indexes + collection structure | Part 1.3 (cung Long) |
| S2 (16-22/03) | Completion + Job limit + Rating service + Suggest + Security Rules | Hoan thanh Part 1.3 |
| S3 (23-28/03) | Cancel policy + Security Rules final + Realtime notifications + Seed data | Part 1.4 + Part 5 + Mo ta backend cho Part 3.2 |
| S4 (29-31/03) | Nhap demo data, final testing | Review report |

### Loc (Frontend Dev 3 + Docs)

| Sprint | Cong viec chinh | Bao cao |
|--------|----------------|---------|
| S1 (09-15/03) | Home page (real data, featured jobs, stats) | -- |
| S2 (16-22/03) | Urgent mode UI + Notification UI + Layout polish | -- |
| S3 (23-28/03) | Testing + fix bugs | Part 2.2 (cung Anh) + Mo ta Home/Urgent/Notification cho Part 3.2 |
| S4 (29-31/03) | Tong hop report + format + quay video demo | Tong hop + format report |

---

## 9. QUY TAC LAM VIEC NHOM

### 9.1 Communication
- **Group chat:** Zalo/Discord -- cap nhat tien do hang ngay
- **Sync meeting:** Moi tuan 1 buoi (Chu nhat toi) -- review tien do, demo, plan tuan sau
- **Urgent issues:** Tag @all trong group chat

### 9.2 Git Rules
- KHONG push truc tiep vao main -- chi Hieu merge tu develop
- Moi feature 1 branch rieng: feature/ten-feature
- Tao Pull Request (PR) khi hoan thanh feature
- It nhat 1 nguoi review PR truoc khi merge vao develop
- Commit message format: feat:, fix:, docs:, style:, refactor:
- Commit thuong xuyen (moi ngay it nhat 1 commit khi dang code)

### 9.3 Code Standards
- TypeScript strict mode
- Tailwind CSS cho styling (khong dung CSS thuan)
- Component naming: PascalCase (JobCard.tsx)
- File naming: camelCase cho services/utils (job.service.ts)
- Moi component < 200 dong -> tach nho neu lon hon

### 9.4 Deadline noi bo

| Moc | Ngay | Noi dung | Check boi |
|-----|------|----------|-----------|
| M1 | **15/03** | Auth + Job CRUD + Profile + Home chay duoc | Hieu |
| M2 | **22/03** | Tat ca 13 chuc nang hoat dong (MVP hoan chinh) | Ca team |
| M3 | **28/03** | Code freeze + Deploy + Report draft 80% | Hieu |
| M4 | **31/03** | XONG HET: Report + Video + Demo data | Ca team |
| -- | 01/04-14/04 | Buffer: fix bug, polish, bo sung | Khi can |
| NOP | **15/04** | Deadline nop bai | Ca team |

---

## 10. SETUP GUIDE (STEP-BY-STEP)

### Buoc 1: Prerequisites
```bash
# Can cai dat
- Node.js >= 18.x (LTS)
- npm >= 9.x hoac yarn
- Git
- VS Code (khuyen nghi)
- Firebase CLI: npm install -g firebase-tools
```

### Buoc 2: Init Project
```bash
# Tao React + Vite + TypeScript
npm create vite@latest unijob-web -- --template react-ts
cd unijob-web

# Cai dependencies chinh
npm install react-router-dom zustand @tanstack/react-query
npm install firebase
npm install date-fns lucide-react framer-motion
npm install react-hot-toast
npm install jspdf

# Cai Tailwind CSS
npm install -D tailwindcss @tailwindcss/vite

# Dev dependencies
npm install -D @types/node eslint prettier
```

### Buoc 3: Firebase Setup
```bash
# Login Firebase
firebase login

# Init Firebase trong project
firebase init
# Chon: Firestore, Functions, Hosting, Storage

# Tao file .env.local
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
```

### Buoc 4: Firebase Console Config
1. Tao project moi tren Firebase Console (https://console.firebase.google.com)
2. Enable Authentication -> Google provider
3. Gioi han domain email: chi cho phep @hcmut.edu.vn
4. Tao Firestore Database (start in test mode, sau do them rules)
5. Enable Storage cho upload anh profile
6. Setup Hosting

### Buoc 5: Git Workflow
```
main          <- Production (deploy)
+-- develop   <- Integration branch
    +-- feature/auth, feature/job-crud, feature/profile, ...
```

---

## 11. ADVANCED FEATURES (4TH WAVE E-COMMERCE)

De dat diem Part 5 (1 diem), de xuat cac tinh nang thuoc lan song thu 4 cua TMDT:

| Feature | Mo ta | Cong nghe |
|---------|--------|-----------|
| **AI Job Matching** | Goi y job phu hop dua tren profile, ky nang, lich su | Firebase ML / Simple algorithm |
| **Real-time Notifications** | Thong bao tuc thoi khi co job moi, ung tuyen | Firestore onSnapshot |
| **Social Proof & Gamification** | Badge, level, leaderboard uy tin | Custom scoring system |
| **Progressive Web App (PWA)** | Cai dat nhu app native, offline support | Vite PWA plugin |
| **Smart Search** | Tim kiem ngu nghia, auto-suggest | Algolia / Firestore index |

---

## 12. UOC TINH CHI PHI

| Hang muc | Chi phi | Ghi chu |
|----------|---------|---------|
| Firebase (Spark Plan) | **$0** | Free tier du cho demo |
| Domain (.com) | ~$12/nam | Tuy chon, co the dung firebase URL |
| Figma | **$0** | Free cho education |
| GitHub | **$0** | Free |
| Vercel Hosting (backup) | **$0** | Free tier |
| **Tong chi phi demo** | **$0 - $12** | |

---

## 13. RISK & MITIGATION

| Rui ro | Muc do | Giai phap |
|--------|--------|-----------|
| Timeline gap (25 ngay lam viec) | Cao | Sprint pace, moi nguoi lam song song, cut scope neu can |
| Team chua quen Firebase | TB | Pair programming, tutorial sessions |
| UI/UX chua hoan thien | TB | Dung Tailwind + component san, focus vao UX flow |
| Data demo khong du thuc te | Thap | Tao script seed data |
| Firestore security rules | TB | Viet rules ngay tu dau |

---

## 14. CHECKLIST TRUOC KHI NOP (15/04/2026)

- [ ] **Part 1.1:** Identify project (da co)
- [ ] **Part 1.2:** Business Model Canvas (da co)
- [ ] **Part 1.3:** Pricing model + Revenue model
- [ ] **Part 1.4:** Development plan + Estimated cost
- [ ] **Part 2.1:** UI/UX Figma hoan chinh (da co)
- [ ] **Part 2.2:** Visual Design principles document
- [ ] **Part 3.1:** Website deployed + chay duoc
- [ ] **Part 3.2:** Source code + Demo chuc nang
- [ ] **Part 4.1:** Video gioi thieu san pham
- [ ] **Part 4.2:** Report format dep, chuyen nghiep
- [ ] **Part 5:** Advanced features documentation + demo
- [ ] Source code tren GitHub
- [ ] README.md huong dan cai dat & chay
- [ ] Demo data day du, thuc te

---

## 15. GHI CHU & CAP NHAT

| Ngay | Noi dung | Nguoi cap nhat |
|------|----------|---------------|
| 05/03/2026 | Khoi tao Review.md - Tong hop concept, plan tech stack, timeline | AI Assistant |
| 05/03/2026 | Phase 0 hoan tat - Init project, cai dependencies, setup Tailwind + Firebase config, tao folder structure, types, services, stores, layout, pages, routing. Build thanh cong, dev server chay OK tai http://localhost:5173 | AI Assistant |
| 06/03/2026 | Phan cong nhom 5 nguoi - Them Section 6-9: vai tro, phan cong, git branch ownership, quy tac nhom | AI Assistant |
| 06/03/2026 | Chia lai khoi luong - Figma da xong, Loc chuyen thanh Frontend Dev 3 + Docs, nhan code: Home page, Urgent, Notification UI, Layout polish | AI Assistant |
| 06/03/2026 | Nen timeline 4 tuan - Tu 6 tuan (den 14/04) thanh 4 sprint (den 31/03). Bo icon/emoji toan bo. Chia bao cao cho ca 5 nguoi viet. Buffer 2 tuan truoc deadline. | AI Assistant |
| | | |

---

> **LUU Y QUAN TRONG:**
> - Uu tien hoan thanh MVP truoc, roi moi polish
> - MVP bao gom: Auth + Job CRUD + Job List + Profile + Dashboard
> - Moi tuan 1 buoi sync tien do team
> - Commit code thuong xuyen, moi feature 1 branch rieng
> - Bao cao: MOI NGUOI viet phan lien quan den code minh, Loc tong hop + format
> - TARGET: XONG HET TRUOC 31/03 -- con 2 tuan buffer truoc deadline
