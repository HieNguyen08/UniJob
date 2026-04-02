import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { User } from '@/types/user';
import type { Job } from '@/types/job';
import type { Rating } from '@/types/rating';

export interface CVExportOptions {
  showDetailedRatings: boolean;
}

// CSS properties to snapshot as inline styles before html2canvas runs.
// html2canvas re-parses stylesheets (which contain oklch in Tailwind v4) and
// fails. The fix: snapshot computed styles (browser resolves oklch → rgb),
// write them as inline styles, then strip ALL stylesheets from the clone so
// html2canvas never encounters oklch.
const SNAPSHOT_PROPS: (keyof CSSStyleDeclaration)[] = [
  'color', 'backgroundColor',
  'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'borderRadius',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'fontVariant',
  'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecoration', 'whiteSpace',
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'gap',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'gridTemplateColumns', 'gridColumn', 'gridRow',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'boxSizing', 'overflow', 'overflowX', 'overflowY',
  'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'opacity', 'boxShadow', 'transform',
  'verticalAlign', 'objectFit', 'cursor',
];

function snapshotStyles(root: HTMLElement): Array<{ el: HTMLElement; savedStyle: string }> {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  const saved: Array<{ el: HTMLElement; savedStyle: string }> = [];

  for (const el of all) {
    saved.push({ el, savedStyle: el.getAttribute('style') ?? '' });
    const computed = window.getComputedStyle(el);
    for (const prop of SNAPSHOT_PROPS) {
      const val = computed[prop];
      if (val && typeof val === 'string' && val !== '') {
        (el.style as Record<string, unknown>)[prop as string] = val;
      }
    }
  }

  return saved;
}

function restoreStyles(saved: Array<{ el: HTMLElement; savedStyle: string }>) {
  for (const { el, savedStyle } of saved) {
    if (savedStyle) {
      el.setAttribute('style', savedStyle);
    } else {
      el.removeAttribute('style');
    }
  }
}

export async function generateCVCertificate(
  element: HTMLElement,
  user: User,
  _completedJobs: Job[],
  _ratings: Rating[],
  _options: CVExportOptions = { showDetailedRatings: false }
): Promise<void> {
  // 1. Apply all computed styles as inline (resolves oklch → rgb)
  const saved = snapshotStyles(element);

  try {
    // 2. Capture — strip ALL stylesheets from the clone so html2canvas CSS
    //    parser never encounters oklch. Inline styles carry all needed values.
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      onclone: (_clonedDoc, clonedElement) => {
        const doc = clonedElement.ownerDocument;
        doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => el.remove());
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
    restoreStyles(saved);
  }
}
