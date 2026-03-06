# 🎓 UniJob — Campus Task Marketplace

> Nền tảng thương mại điện tử nội bộ kết nối công việc ngắn hạn dành cho sinh viên, giảng viên và CLB trong trường đại học.

**Môn học:** Electronic Commerce - CO3027 (HK252)  
**Tech Stack:** React 19 · TypeScript · Vite · Tailwind CSS · Firebase · Zustand

---

## 📸 Preview

| Trang chủ | Tìm việc | Đăng việc |
|-----------|----------|-----------|
| Hero + Features | Filter + Search + Cards | Form đầy đủ |

---

## 🚀 Cách 1: Chạy trực tiếp (Khuyến nghị cho dev)

### Yêu cầu
- **Node.js** >= 18.x — [Tải tại đây](https://nodejs.org/)
- **npm** >= 9.x (đi kèm Node.js)
- **Git**

### Các bước

```bash
# 1. Clone repository
git clone https://github.com/HieNguyen08/UniJob.git
cd UniJob/unijob-web

# 2. Cài đặt dependencies
npm install

# 3. Tạo file cấu hình Firebase
#    Copy file mẫu và điền API keys từ Firebase Console
cp .env.local.example .env.local
#    Sau đó mở .env.local và điền các giá trị thật

# 4. Chạy development server
npm run dev
```

Mở trình duyệt tại **http://localhost:5173**

### Các lệnh khác

```bash
npm run build      # Build production
npm run preview    # Preview bản build
npm run lint       # Kiểm tra code style
```

---

## 🐳 Cách 2: Chạy bằng Docker

### Yêu cầu
- **Docker** >= 20.x — [Tải tại đây](https://docs.docker.com/get-docker/)
- **Docker Compose** (đi kèm Docker Desktop)

### Chạy nhanh bằng Docker Compose (khuyến nghị)

```bash
# 1. Clone repository
git clone https://github.com/HieNguyen08/UniJob.git
cd UniJob

# 2. Tạo file cấu hình Firebase
cp unijob-web/.env.local.example unijob-web/.env.local
#    Mở unijob-web/.env.local và điền API keys

# 3. Build và chạy
docker compose up --build

# Hoặc chạy nền (detached mode)
docker compose up --build -d
```

Mở trình duyệt tại **http://localhost:3000**

### Chạy bằng Docker thuần

```bash
cd UniJob/unijob-web

# Build image
docker build -t unijob-web .

# Chạy container
docker run -p 3000:80 --name unijob unijob-web
```

### Dừng container

```bash
docker compose down          # Nếu dùng Compose
docker stop unijob           # Nếu dùng Docker thuần
```

---

## ⚙️ Cấu hình Firebase

1. Truy cập [Firebase Console](https://console.firebase.google.com)
2. Tạo project mới (hoặc dùng project có sẵn)
3. Vào **Project Settings** → **General** → **Your apps** → Thêm Web app
4. Copy các giá trị config và điền vào file `.env.local`:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

5. Enable các service:
   - **Authentication** → Sign-in method → Google ✅
   - **Cloud Firestore** → Create database
   - **Storage** → Get started

---

## 📁 Cấu trúc dự án

```
unijob-web/
├── src/
│   ├── components/layout/   # Header, Footer, Layout
│   ├── pages/               # Home, Login, JobList, JobDetail,
│   │                        # CreateJob, Profile, Dashboard, NotFound
│   ├── services/            # Firebase service layer (auth, job, user, rating)
│   ├── store/               # Zustand state management
│   ├── types/               # TypeScript type definitions
│   ├── lib/                 # Firebase config, utils, constants
│   ├── App.tsx              # Router + Providers
│   └── main.tsx             # Entry point
├── Dockerfile               # Multi-stage Docker build
├── nginx.conf               # Nginx config for SPA
├── .env.local.example       # Template cho Firebase keys
└── package.json
```

---

## 🛠️ Tech Stack

| Layer | Công nghệ | Mục đích |
|-------|-----------|----------|
| Frontend | React 19 + TypeScript | UI framework |
| Build | Vite | Dev server + bundler |
| Styling | Tailwind CSS v4 | Utility-first CSS |
| State | Zustand | Global state management |
| Data | TanStack Query | Server state + caching |
| Backend | Firebase | Auth, Database, Storage, Hosting |
| Animation | Framer Motion | Page transitions + micro-interactions |
| Icons | Lucide React | Icon library |
| Container | Docker + Nginx | Production deployment |

---

## 👥 Team

| Thành viên | Vai trò | Trách nhiệm chính |
|------------|---------|-------------------|
| Nguyễn Minh Hiếu | 🔧 Tech Lead / Full-stack | Kiến trúc, setup, review code, deploy, Firebase config |
| Thái Bảo Long | 🎨 Frontend Developer 1 | Job List, Job Detail, Create Job, Urgent, Anonymous |
| Ngô Quang Anh | 🎨 Frontend Developer 2 | Dashboard, Profile, Rating UI, Responsive |
| Diệp Vũ Minh | ⚙️ Backend/Firebase Dev | Firestore services, Security Rules, data seeding |
| Lộc | 📝 UI/UX + Documentation | Figma design, báo cáo, video demo, Business docs |

---

## 📝 License

Dự án phục vụ mục đích học tập — Môn Electronic Commerce CO3027, HK252
