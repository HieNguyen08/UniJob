import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { User } from '@/types/user';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';

export interface CVExportOptions {
  showDetailedRatings: boolean;
}

/**
 * Capture the certificate preview DOM element with html2canvas
 * and embed it in a PDF — this preserves Vietnamese text exactly
 * as the browser renders it, bypassing jsPDF's limited font support.
 */
export async function generateCVCertificate(
  element: HTMLElement,
  user: User,
  _completedJobs: Job[],
  _ratings: Rating[],
  _options: CVExportOptions = { showDetailedRatings: false }
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

  const safeName = (user.displayName || 'user').replace(/\s+/g, '_');
  pdf.save(`certificate_${safeName}.pdf`);
}
