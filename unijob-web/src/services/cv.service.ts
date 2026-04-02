import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { User } from '@/types/user';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';

export interface CVExportOptions {
  showDetailedRatings: boolean;
}

/**
 * html2canvas cannot parse oklch() colors used by Tailwind v4.
 * Fix: before capturing, read each element's computed style (browser resolves
 * oklch → rgb) and write it as inline style so html2canvas only sees rgb.
 * Also remove oklch style tags in the cloned doc.
 * Inline styles are restored after capture.
 */
export async function generateCVCertificate(
  element: HTMLElement,
  user: User,
  _completedJobs: Job[],
  _ratings: Rating[],
  _options: CVExportOptions = { showDetailedRatings: false }
): Promise<void> {
  // 1. Apply computed colors as inline styles (resolves oklch → rgb)
  const all = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];
  const saved: Array<{ el: HTMLElement; style: string }> = [];

  for (const el of all) {
    const computed = window.getComputedStyle(el);
    saved.push({ el, style: el.getAttribute('style') ?? '' });
    el.style.color = computed.color;
    el.style.backgroundColor = computed.backgroundColor;
    el.style.borderColor = computed.borderColor;
    el.style.borderTopColor = computed.borderTopColor;
    el.style.borderRightColor = computed.borderRightColor;
    el.style.borderBottomColor = computed.borderBottomColor;
    el.style.borderLeftColor = computed.borderLeftColor;
  }

  try {
    // 2. Capture — remove oklch style tags from clone so html2canvas CSS
    //    parser never encounters them (inline styles already carry rgb values)
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('style').forEach((s) => {
          if (s.textContent?.includes('oklch')) s.remove();
        });
      },
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    const safeName = (user.displayName || 'user').replace(/\s+/g, '_');
    pdf.save(`certificate_${safeName}.pdf`);
  } finally {
    // 3. Restore original inline styles
    for (const { el, style } of saved) {
      if (style) {
        el.setAttribute('style', style);
      } else {
        el.removeAttribute('style');
      }
    }
  }
}
