import { jsPDF } from 'jspdf';
import type { User } from '@/types/user';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';

export interface CVExportOptions {
  showDetailedRatings: boolean;
}

/* ------------------------------------------------------------------ */
/*  Colors (plain hex — no oklch anywhere)                            */
/* ------------------------------------------------------------------ */
const C = {
  emerald: '#10b981', emeraldDk: '#059669', emeraldLt: '#d1fae5',
  yellow: '#d97706', yellowLt: '#fef3c7',
  blue: '#2563eb', blueLt: '#dbeafe',
  gray900: '#111827', gray800: '#1f2937', gray500: '#6b7280',
  gray400: '#9ca3af', gray200: '#e5e7eb', gray100: '#f3f4f6',
  gray50: '#f9fafb', white: '#ffffff',
};

/* ------------------------------------------------------------------ */
/*  Canvas helpers                                                     */
/* ------------------------------------------------------------------ */
const SCALE = 3;          // render at 3× for sharp PDF
const A4_W = 794;         // A4 at 96 dpi
const A4_H = 1123;
const W = A4_W;           // logical width
const M = 75;             // margin (logical px)
const CW = W - M * 2;    // content width

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number, color: string,
) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number, color: string, lw = 1,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBriefcase(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  // Body
  const bw = size * 0.65, bh = size * 0.42;
  strokeRoundRect(ctx, cx - bw / 2, cy - bh / 2 + 2, bw, bh, 3, C.white, 2.5);
  // Handle
  const hw = size * 0.28, hh = size * 0.18;
  strokeRoundRect(ctx, cx - hw / 2, cy - bh / 2 - hh + 3, hw, hh, 2, C.white, 2.5);
  // Middle line
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, cy + 2);
  ctx.lineTo(cx + bw / 2, cy + 2);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/*  Main: draw certificate on Canvas → embed in jsPDF                  */
/* ------------------------------------------------------------------ */
export async function generateCVCertificate(
  _element: HTMLElement,
  user: User,
  completedJobs: Job[],
  ratings: Rating[],
  options: CVExportOptions = { showDetailedRatings: false },
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = A4_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // White background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, A4_H);

  let y = 0;

  /* ── Green top bar ─────────────────────────────────────────────── */
  ctx.fillStyle = C.emerald;
  ctx.fillRect(0, 0, W, 14);
  y = 14;

  /* ── Logo ──────────────────────────────────────────────────────── */
  y += 35;
  const logoSize = 50;
  const logoX = (W - logoSize) / 2;
  fillRoundRect(ctx, logoX, y, logoSize, logoSize, 12, C.emerald);
  drawBriefcase(ctx, W / 2, y + logoSize / 2, logoSize * 0.6);
  y += logoSize + 20;

  /* ── Title ─────────────────────────────────────────────────────── */
  ctx.font = 'bold 22px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray800;
  ctx.textAlign = 'center';
  ctx.fillText('CHỨNG NHẬN KINH NGHIỆM THỰC TẾ', W / 2, y);
  y += 22;

  ctx.font = '13px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray500;
  ctx.fillText('Chứng nhận cấp cho sinh viên', W / 2, y);
  y += 35;

  /* ── User name ─────────────────────────────────────────────────── */
  ctx.font = 'bold 26px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray900;
  const displayName = (user.displayName || 'Sinh viên').toUpperCase();
  ctx.fillText(displayName, W / 2, y);
  y += 20;

  const subtitle = [user.faculty, user.studentId ? `MSSV: ${user.studentId}` : '']
    .filter(Boolean).join(' — ');
  if (subtitle) {
    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = C.gray500;
    ctx.fillText(subtitle, W / 2, y);
  }
  y += 40;

  /* ── 3 Stat boxes ──────────────────────────────────────────────── */
  const totalHours = completedJobs.reduce((s, j) => s + (parseFloat(j.duration) || 2), 0);
  const ratingText = user.ratingScore ? `${user.ratingScore}/5` : 'N/A';

  const stats = [
    { value: String(completedJobs.length), label: 'Công việc', iconBg: C.emeraldLt, dot: C.emeraldDk },
    { value: ratingText, label: 'Đánh giá', iconBg: C.yellowLt, dot: C.yellow },
    { value: String(Math.round(totalHours)), label: 'Giờ làm việc', iconBg: C.blueLt, dot: C.blue },
  ];

  const boxW = (CW - 20) / 3;
  const boxH = 100;
  const boxY = y;

  stats.forEach((stat, i) => {
    const bx = M + i * (boxW + 10);
    fillRoundRect(ctx, bx, boxY, boxW, boxH, 12, C.gray50);

    // Icon circle
    fillCircle(ctx, bx + boxW / 2, boxY + 30, 16, stat.iconBg);
    fillCircle(ctx, bx + boxW / 2, boxY + 30, 5, stat.dot);

    // Value
    ctx.font = 'bold 24px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = C.gray900;
    ctx.textAlign = 'center';
    ctx.fillText(stat.value, bx + boxW / 2, boxY + 68);

    // Label
    ctx.font = '12px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = C.gray500;
    ctx.fillText(stat.label, bx + boxW / 2, boxY + 88);
  });

  y = boxY + boxH + 35;

  /* ── Completed projects ────────────────────────────────────────── */
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray400;
  ctx.fillText('DANH SÁCH DỰ ÁN ĐÃ HOÀN THÀNH', M, y);
  y += 20;

  if (completedJobs.length === 0) {
    ctx.font = 'italic 14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = C.gray400;
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dự án nào hoàn thành.', W / 2, y);
    ctx.textAlign = 'left';
    y += 30;
  } else {
    const jobsToShow = completedJobs.slice(0, 8);
    jobsToShow.forEach((job, idx) => {
      // Separator
      if (idx > 0) {
        ctx.strokeStyle = C.gray100;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(M, y - 5);
        ctx.lineTo(W - M, y - 5);
        ctx.stroke();
      }

      // Number circle
      fillCircle(ctx, M + 10, y + 6, 10, C.emerald);
      ctx.font = 'bold 11px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.white;
      ctx.textAlign = 'center';
      ctx.fillText(String(idx + 1), M + 10, y + 10);

      // Title
      ctx.textAlign = 'left';
      ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.gray800;
      const titleText = job.title.length > 45 ? job.title.substring(0, 45) + '...' : job.title;
      ctx.fillText(titleText, M + 28, y + 5);

      // Category
      ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.emeraldDk;
      ctx.fillText(job.category || '', M + 28, y + 20);

      // Date
      let dateStr = '';
      try {
        if (job.createdAt && typeof job.createdAt.toDate === 'function') {
          dateStr = job.createdAt.toDate().toLocaleDateString('vi-VN');
        }
      } catch { /* ignore */ }
      if (dateStr) {
        ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillStyle = C.gray400;
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, W - M, y + 12);
        ctx.textAlign = 'left';
      }

      y += 35;
    });

    if (completedJobs.length > 8) {
      ctx.font = '12px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.gray400;
      ctx.textAlign = 'center';
      ctx.fillText(`... và ${completedJobs.length - 8} dự án khác`, W / 2, y);
      ctx.textAlign = 'left';
      y += 20;
    }
  }

  /* ── Detailed ratings (optional) ───────────────────────────────── */
  if (options.showDetailedRatings && ratings.length > 0) {
    y += 10;
    ctx.font = 'bold 11px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = C.gray400;
    ctx.fillText('ĐÁNH GIÁ TỪ NGƯỜI THUÊ', M, y);
    y += 20;

    ratings.slice(0, 5).forEach((r) => {
      // Star dots
      for (let s = 0; s < 5; s++) {
        fillCircle(ctx, M + 8 + s * 16, y, 6, s < Math.round(r.score) ? C.yellow : C.gray200);
      }
      ctx.font = '13px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.gray500;
      ctx.fillText(`(${r.score}/5)`, M + 90, y + 4);

      if (r.comment) {
        y += 16;
        ctx.font = 'italic 12px "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillStyle = C.gray500;
        const cmt = r.comment.length > 65 ? r.comment.substring(0, 65) + '...' : r.comment;
        ctx.fillText(`"${cmt}"`, M + 6, y);
      }
      y += 22;
    });
  }

  /* ── Footer ────────────────────────────────────────────────────── */
  const footerY = Math.max(y + 30, A4_H - 100);

  // Separator line
  ctx.strokeStyle = C.gray200;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, footerY);
  ctx.lineTo(W - M, footerY);
  ctx.stroke();

  // QR placeholder
  const qrY = footerY + 12;
  strokeRoundRect(ctx, M, qrY, 36, 36, 4, C.gray200, 1);
  ctx.font = '9px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray400;
  ctx.textAlign = 'center';
  ctx.fillText('QR', M + 18, qrY + 21);

  // Brand
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray800;
  ctx.fillText('UniJob', M + 48, qrY + 16);

  ctx.font = '12px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray500;
  ctx.fillText('Kết nối việc làm Sinh viên', M + 48, qrY + 32);

  // Date
  ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = C.gray400;
  ctx.textAlign = 'right';
  ctx.fillText(`Ngày cấp: ${new Date().toLocaleDateString('vi-VN')}`, W - M, qrY + 24);

  /* ── Green bottom bar ──────────────────────────────────────────── */
  ctx.fillStyle = C.emerald;
  ctx.fillRect(0, A4_H - 14, W, 14);

  /* ── Export to PDF ─────────────────────────────────────────────── */
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);

  const safeName = (user.displayName || 'user').replace(/\s+/g, '_');
  pdf.save(`certificate_${safeName}.pdf`);
}
