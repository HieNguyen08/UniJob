# UniJob Report – Hướng dẫn viết báo cáo CO3027

## 1. Cấu trúc báo cáo (theo yêu cầu môn học)

```
Report/
  main.tex                   ← File compile chính (XeLaTeX)
  chapters/
    part1_1.tex  ✅ DONE     ← 1.1 Xác định dự án (0.5đ)
    part1_2.tex  ✅ DONE     ← 1.2 Business Model Canvas (0.5đ)
    part1_3.tex  ✅ DONE     ← 1.3 Pricing & Revenue Model (1đ)
    part1_4.tex  ⚠️ PARTIAL  ← 1.4 Kế hoạch phát triển & Chi phí (1đ)
    part2_1.tex  ✅ DONE     ← 2.1 Thiết kế UI/UX (1đ)
    part2_2.tex  ✅ DONE     ← 2.2 Nguyên lý thiết kế hình thức (0.5đ)
    part3_1.tex  ✅ DONE     ← 3.1 Triển khai & Framework (1đ)
    part3_2.tex  ✅ DONE     ← 3.2 Demo code (1đ)
    part4.tex    ⚠️ PARTIAL  ← 4. Trình bày (1đ) – điền sau khi trình bày
    part5.tex    ✅ DONE     ← 5. Tính năng nâng cao / 4th Wave (1đ)
  images/
    bmc.png                  ← Business Model Canvas (từ Report-Assignment/)
```

**Điểm cần điền thêm:**
- `part1_4.tex`: 2 dòng `[TODO: Thêm các marketing action cụ thể của nhóm]`
  ở Giai đoạn 2 và 3 — Hieu + Minh phụ trách
- `part4.tex`: Điền sau buổi trình bày (ngày, Q&A, phản hồi)
- `main.tex`: Điền số nhóm, tên GVHD, MSSV các thành viên

---

## 2. Hướng dẫn compile LaTeX

### Yêu cầu
- Cài **MiKTeX** (Windows) hoặc **TeX Live** (Linux/Mac)
- Dùng **XeLaTeX** (không phải pdfLaTeX) vì báo cáo có tiếng Việt với `polyglossia`

### Compile
```bash
# Lần đầu (tạo .aux, .toc)
xelatex main.tex

# Lần 2 (cập nhật mục lục, tham chiếu)
xelatex main.tex
```

Hoặc dùng **Overleaf**: upload toàn bộ thư mục `Report/`, set compiler = XeLaTeX.

### Nếu dùng pdfLaTeX thay thế
Sửa phần encoding trong `main.tex` (dòng 9–11):
```latex
% Thay 3 dòng XeLaTeX bằng:
\usepackage[utf8]{inputenc}
\usepackage[T5]{fontenc}
\usepackage[vietnamese]{babel}
```

---

## 3. Code `main.tex` (đầy đủ)

```latex
% ============================================================
%  UniJob – Báo cáo môn Electronic Commerce CO3027 HK252
%  Compile: XeLaTeX  (xelatex main.tex)
% ============================================================
\documentclass[12pt, a4paper]{report}

% ---------- Encoding & Font (XeLaTeX) ----------
\usepackage{fontspec}
\usepackage{polyglossia}
\setmainlanguage{vietnamese}
\setotherlanguage{english}

% ---------- Layout ----------
\usepackage[a4paper, top=2.5cm, bottom=2.5cm,
            left=3cm, right=2cm]{geometry}
\usepackage{setspace}
\onehalfspacing
\usepackage{parskip}

% ---------- Header / Footer ----------
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small UniJob -- CO3027 HK252}
\fancyhead[R]{\small Nhóm X}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}

% ---------- Hình ảnh & bảng ----------
\usepackage{graphicx}
\usepackage{float}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{array}
\usepackage{multirow}
\usepackage{caption}
\graphicspath{{images/}}

% ---------- Màu sắc & Code ----------
\usepackage{xcolor}
\usepackage{listings}
\definecolor{codegray}{rgb}{0.95,0.95,0.95}
\lstset{
  backgroundcolor=\color{codegray},
  basicstyle=\footnotesize\ttfamily,
  breaklines=true,
  frame=single,
  language=JavaScript,
  numbers=left,
  numberstyle=\tiny\color{gray},
  keywordstyle=\color{blue},
  stringstyle=\color{orange!70!black},
  commentstyle=\color{green!50!black},
  tabsize=2,
  captionpos=b,
}

% ---------- Hyperlink ----------
\usepackage[colorlinks=true, linkcolor=black,
            urlcolor=blue, citecolor=blue]{hyperref}

% ---------- Misc ----------
\usepackage{enumitem}
\usepackage{tikz}
\usepackage{amsmath}

% ============================================================
\begin{document}

% ---------- Trang bìa ----------
\begin{titlepage}
  \centering
  \vspace*{1cm}
  {\large\textbf{TRƯỜNG ĐẠI HỌC BÁCH KHOA TP.HCM}}\\[0.3cm]
  {\large Khoa Khoa học \& Kỹ thuật Máy tính}\\[1.5cm]

  {\Huge\textbf{UniJob}}\\[0.5cm]
  {\Large\textbf{Campus Task Marketplace}}\\[0.3cm]
  {\large Nền tảng thương mại điện tử nội bộ kết nối\\
  công việc ngắn hạn dành cho sinh viên đại học}\\[2cm]

  \begin{tabular}{ll}
    \textbf{Môn học:}   & Electronic Commerce -- CO3027 (HK252) \\[0.3cm]
    \textbf{Nhóm:}      & [Số nhóm] \\[0.3cm]
    \textbf{GVHD:}      & [Tên giảng viên] \\[0.3cm]
    \textbf{Thành viên:} & Nguyễn Minh Hiếu -- [MSSV] \\
                         & Thái Bảo Long    -- [MSSV] \\
                         & Ngô Quang Anh    -- [MSSV] \\
                         & Điệp Vũ Minh     -- [MSSV] \\
                         & Nguyễn Quốc Lộc  -- [MSSV] \\
  \end{tabular}\\[2cm]

  {\large TP. Hồ Chí Minh, tháng 04 năm 2026}
\end{titlepage}

% ---------- Mục lục ----------
\tableofcontents
\newpage
\listoffigures
\listoftables
\newpage

% ============================================================
\chapter{Giới thiệu dự án và Kế hoạch}
\label{chap:intro}

\section{Xác định dự án}
\input{chapters/part1_1}

\section{Business Model Canvas}
\input{chapters/part1_2}

\section{Pricing Model và Revenue Model}
\input{chapters/part1_3}

\section{Kế hoạch phát triển và Chi phí ước tính}
\input{chapters/part1_4}

% ============================================================
\chapter{Thiết kế}
\label{chap:design}

\section{Thiết kế giao diện người dùng (UI/UX)}
\input{chapters/part2_1}

\section{Nguyên lý thiết kế hình thức}
\input{chapters/part2_2}

% ============================================================
\chapter{Triển khai}
\label{chap:impl}

\section{Triển khai website và Framework sử dụng}
\input{chapters/part3_1}

\section{Demo code}
\input{chapters/part3_2}

% ============================================================
\chapter{Trình bày}
\label{chap:pres}
\input{chapters/part4}

% ============================================================
\chapter{Tính năng nâng cao -- Làn sóng thương mại điện tử thứ tư}
\label{chap:advanced}
\input{chapters/part5}

% ============================================================
\end{document}
```

---

## 4. Tóm tắt nội dung các phần đã hoàn thiện

### Chương 1 – Giới thiệu dự án và Kế hoạch

#### 1.1 Xác định dự án ✅
- **Bối cảnh:** môi trường đại học dùng Facebook/Zalo/Email để kết nối task — phi chính thức
- **3 vấn đề cốt lõi:** thông tin phân tán, thiếu đánh giá năng lực, không số hóa quy trình
- **Market research:** so sánh 4 kênh (Facebook, Zalo, Email, Google Form)
- **Ý tưởng:** UniJob = campus marketplace C2C+B2C với email @hcmut.edu.vn làm xác thực
- **Khách hàng:** Bên đăng task (GV, CLB, phòng ban) + Bên nhận task (sinh viên)
- **Tính khả thi:** kỹ thuật (React+Firebase), vận hành (campus), pháp lý (dịch vụ nội bộ)

#### 1.2 Business Model Canvas ✅
- Hình BMC từ `images/bmc.png` (đã sao chép từ Report-Assignment/)
- Bảng tóm tắt 9 khối: Customer Segments, Value Propositions, Channels, Customer Relationships,
  Revenue Streams, Key Resources, Key Activities, Key Partnerships, Cost Structure

#### 1.3 Pricing & Revenue Model ✅
- **5 nguồn doanh thu:**
  1. Transaction Fee: 3-5% (core)
  2. Subscription tổ chức: Basic/Club 299k/Department 799k
  3. Premium Listing: Featured 29-49k, Urgent 19k
  4. Campus Advertising: banner 249-399k/tuần
  5. Verification Service: 19k/lần (phase 2)
- **Pricing stages:** Penetration (0-3 tháng free) → Freemium+Tiered (tháng 4-12)
- **Dự báo:** tháng 12 = 7.1M VNĐ; năm 1 = 52-68M VNĐ (kịch bản cơ sở)
- **10 KPI** theo dõi để tối ưu pricing model

#### 1.4 Kế hoạch phát triển & Chi phí ⚠️ (cần thêm marketing actions)
- 3 giai đoạn: Awareness (T1-3), Engagement (T4-9), Retention (T10-12)
- Bảng chi phí: Firebase 0-500k, domain 200k/năm, marketing activation 4.5M
- Tổng năm đầu ~30M VNĐ; doanh thu 52-68M → lợi nhuận ~22-38M

### Chương 2 – Thiết kế

#### 2.1 UI/UX ✅
- Triết lý: mobile-first, minimalist, emerald color system
- 6 màn hình chính: Home, JobList, JobDetail, Profile, CVExport, Login
- Figma → React 19 + Tailwind CSS v4, framer-motion animations

#### 2.2 Nguyên lý thiết kế ✅
- 4 nguyên lý CARP (Contrast, Alignment, Repetition, Proximity)
- Typography 5 levels, Button 3 variants, Card system, Badge system
- Spacing 4px base, responsive breakpoints

### Chương 3 – Triển khai

#### 3.1 Triển khai & Framework ✅
- Stack: React 19 + Vite 8 + TypeScript + Tailwind v4 + Firebase
- Firestore 6 collections với Security Rules
- Firebase Hosting (project: unijob-ad6eb), free tier → Blaze khi scale

#### 3.2 Demo code ✅
- Google OAuth sign-in
- handleApply với duplicate guard
- AI scoring algorithm
- Canvas 2D PDF export (thay html2canvas vì lỗi oklch)
- Client-side search filter
- Zustand authStore

### Chương 4 – Trình bày ⚠️
- Placeholder — điền sau buổi trình bày

### Chương 5 – Tính năng nâng cao ✅
- AI Job Recommendation (đã triển khai)
- CV Passport PDF (đã triển khai)
- Gamification & Trust Score (đã triển khai)
- Smart Matching for Collaboration (đang phát triển)
- Real-time Campus Marketplace (đã triển khai)

---

## 5. Phân công viết báo cáo

| Phần | Người phụ trách | Trạng thái |
|------|----------------|-----------|
| 1.1  | Hiếu           | ✅ Done   |
| 1.2  | Hiếu           | ✅ Done (cần thêm BMC image nếu muốn custom) |
| 1.3  | Hiếu           | ✅ Done   |
| 1.4  | Hiếu + Minh    | ⚠️ Cần điền [TODO] marketing actions |
| 2.1  | Anh            | ✅ Done (Hiếu viết từ codebase) |
| 2.2  | Anh            | ✅ Done   |
| 3.1  | Hiếu           | ✅ Done   |
| 3.2  | Hiếu           | ✅ Done   |
| 4    | Tất cả         | ⚠️ Điền sau trình bày |
| 5    | Hiếu + Minh    | ✅ Done   |
