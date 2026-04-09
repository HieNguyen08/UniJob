import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/zip', 'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File "${file.name}" vượt quá ${MAX_FILE_SIZE_MB}MB`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File "${file.name}" không được hỗ trợ`;
  }
  return null;
}

/**
 * Upload a single file to Firebase Storage under /jobs/{jobId}/attachments/
 * Returns the public download URL.
 */
export async function uploadJobAttachment(
  jobId: string,
  file: File
): Promise<string> {
  const path = `jobs/${jobId}/attachments/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

/**
 * Upload multiple files and return all download URLs.
 */
export async function uploadJobAttachments(
  jobId: string,
  files: File[]
): Promise<string[]> {
  return Promise.all(files.map((f) => uploadJobAttachment(jobId, f)));
}

/**
 * Delete a file by its download URL.
 */
export async function deleteAttachment(downloadUrl: string): Promise<void> {
  const fileRef = ref(storage, downloadUrl);
  await deleteObject(fileRef);
}
