const STORAGE_HOST = 'firebasestorage.googleapis.com';

/** True only for a download URL of our own bucket inside this job's attachments folder. */
export function isJobAttachmentUrl(url: string, jobId: string): boolean {
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined;
  if (!bucket) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname === STORAGE_HOST &&
      u.pathname.startsWith(`/v0/b/${bucket}/o/jobs%2F${encodeURIComponent(jobId)}%2Fattachments%2F`)
    );
  } catch {
    return false;
  }
}

/** File name shown in the attachment list. */
export function attachmentName(url: string, index: number): string {
  try {
    return decodeURIComponent(url.split('%2F').pop()?.split('?')[0] || `file-${index + 1}`);
  } catch {
    return `file-${index + 1}`;
  }
}
