import { jsPDF } from 'jspdf';
import type { User } from '@/types/user';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export interface CVExportOptions {
  showDetailedRatings: boolean;
}

const PRIMARY_COLOR: [number, number, number] = [16, 185, 129]; // emerald-500
const DARK_COLOR: [number, number, number] = [31, 41, 55]; // gray-800
const MUTED_COLOR: [number, number, number] = [107, 114, 128]; // gray-500
const LIGHT_BG: [number, number, number] = [243, 244, 246]; // gray-100

const PAGE_MARGIN = 20;
const PAGE_WIDTH = 210; // A4
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function drawRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: 'S' | 'F' | 'FD' = 'F'
) {
  doc.roundedRect(x, y, w, h, r, r, style);
}

export function generateCVCertificate(
  user: User,
  completedJobs: Job[],
  ratings: Rating[],
  options: CVExportOptions = { showDetailedRatings: false }
): void {
  const doc = new jsPDF('p', 'mm', 'a4');

  let y = 0;

  // === HEADER BAR (green) ===
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, PAGE_WIDTH, 12, 'F');

  y = 24;

  // === LOGO ICON (green rounded square) ===
  const logoX = PAGE_WIDTH / 2 - 8;
  doc.setFillColor(...PRIMARY_COLOR);
  drawRoundedRect(doc, logoX, y, 16, 16, 3, 'F');
  // briefcase icon placeholder (white text)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('UJ', logoX + 3.5, y + 11);

  y += 24;

  // === TITLE ===
  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('CHUNG NHAN KINH NGHIEM THUC TE', PAGE_WIDTH / 2, y, { align: 'center' });

  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Chung nhan cap cho sinh vien', PAGE_WIDTH / 2, y, { align: 'center' });

  y += 14;

  // === USER NAME ===
  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(user.displayName || 'Sinh vien', PAGE_WIDTH / 2, y, { align: 'center' });

  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_COLOR);
  const facultyLine = [user.faculty, user.studentId ? `MSSV: ${user.studentId}` : '']
    .filter(Boolean)
    .join(' - ');
  if (facultyLine) {
    doc.text(facultyLine, PAGE_WIDTH / 2, y, { align: 'center' });
  }

  y += 14;

  // === 3 STAT BOXES ===
  const boxW = (CONTENT_WIDTH - 10) / 3;
  const boxH = 28;
  const boxStartX = PAGE_MARGIN;

  const totalHours = completedJobs.reduce((sum, job) => {
    const duration = parseFloat(job.duration) || 2;
    return sum + duration;
  }, 0);

  const stats = [
    { value: String(completedJobs.length), label: 'Cong viec', icon: 'chart' },
    {
      value: user.ratingScore ? `${user.ratingScore}/5` : 'N/A',
      label: 'Danh gia',
      icon: 'star',
    },
    { value: String(Math.round(totalHours)), label: 'Gio lam viec', icon: 'clock' },
  ];

  stats.forEach((stat, i) => {
    const bx = boxStartX + i * (boxW + 5);
    doc.setFillColor(...LIGHT_BG);
    drawRoundedRect(doc, bx, y, boxW, boxH, 3, 'F');

    // Icon placeholder
    doc.setFillColor(...PRIMARY_COLOR);
    drawRoundedRect(doc, bx + 8, y + 6, 8, 8, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5);
    doc.text(stat.icon === 'chart' ? 'III' : stat.icon === 'star' ? '*' : 'O', bx + 10, y + 12);

    // Value
    doc.setTextColor(...DARK_COLOR);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(stat.value, bx + 22, y + 13);

    // Label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_COLOR);
    doc.text(stat.label, bx + 22, y + 20);
  });

  y += boxH + 14;

  // === COMPLETED PROJECTS SECTION ===
  doc.setTextColor(...MUTED_COLOR);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DANH SACH DU AN DA HOAN THANH', PAGE_MARGIN, y);

  y += 6;

  // Divider line
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);

  y += 6;

  // Job list
  completedJobs.forEach((job, index) => {
    // Check page overflow
    if (y > 250) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    // Bullet number
    doc.setFillColor(...PRIMARY_COLOR);
    doc.circle(PAGE_MARGIN + 3, y + 1, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.text(String(index + 1), PAGE_MARGIN + 1.8, y + 2.5);

    // Job title
    doc.setTextColor(...DARK_COLOR);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(job.title, PAGE_MARGIN + 10, y + 2);

    // Category tag
    if (job.category) {
      const tagX = PAGE_MARGIN + 10;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PRIMARY_COLOR);
      doc.text(job.category, tagX, y + 8);
    }

    // Date on the right
    if (job.createdAt) {
      const dateStr = format(job.createdAt.toDate(), 'dd/MM/yyyy', { locale: vi });
      doc.setTextColor(...MUTED_COLOR);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(dateStr, PAGE_WIDTH - PAGE_MARGIN, y + 2, { align: 'right' });
    }

    // Rating for this job (if showDetailedRatings)
    if (options.showDetailedRatings) {
      const jobRating = ratings.find((r) => r.jobId === job.id);
      if (jobRating) {
        doc.setTextColor(...MUTED_COLOR);
        doc.setFontSize(7);
        doc.text(`Danh gia: ${jobRating.score}/5`, PAGE_WIDTH - PAGE_MARGIN, y + 8, {
          align: 'right',
        });
      }
    }

    y += options.showDetailedRatings ? 16 : 12;

    // Separator
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN + 10, y - 3, PAGE_WIDTH - PAGE_MARGIN, y - 3);
  });

  if (completedJobs.length === 0) {
    doc.setTextColor(...MUTED_COLOR);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Chua co du an nao hoan thanh.', PAGE_MARGIN + 10, y + 2);
    y += 12;
  }

  // === QR CODE PLACEHOLDER (Minh's task) ===
  y = Math.max(y + 10, 230);
  if (y > 250) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  // Placeholder box for QR
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(PAGE_MARGIN, y, 25, 25, 'S');
  doc.setTextColor(...MUTED_COLOR);
  doc.setFontSize(5);
  doc.text('QR Code', PAGE_MARGIN + 5, y + 14);

  // === FOOTER BRANDING ===
  const footerY = y + 5;
  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('UniWork', PAGE_MARGIN + 30, footerY + 5);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Ket noi viec lam Sinh vien', PAGE_MARGIN + 30, footerY + 10);

  const genDate = format(new Date(), 'dd/MM/yyyy');
  doc.text(`Ngay tao: ${genDate}`, PAGE_MARGIN + 30, footerY + 15);

  // Bottom green bar
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 285, PAGE_WIDTH, 12, 'F');

  // Save
  const fileName = `UniJob_Certificate_${(user.displayName || 'user').replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
