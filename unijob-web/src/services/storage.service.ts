import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

// Phải khớp storage.rules (test: tests/unit/services/storage.service.test.ts).
const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 100;
export const MAX_ATTACHMENTS = 10;
export const ATTACHMENT_UPLOAD_ERROR =
  'Không tải lên được tệp đính kèm, công việc đã được đăng không kèm tệp.';
export const ALLOWED_EXTENSIONS: readonly string[] = [
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'zip', 'doc', 'docx', 'xls', 'xlsx',
];
export const ALLOWED_TYPES: readonly string[] = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/zip', 'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File "${file.name}" vượt quá ${MAX_FILE_SIZE_MB}MB`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File "${file.name}" không được hỗ trợ`;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File "${file.name}" không được hỗ trợ`;
  }
  if (file.name.length > MAX_FILE_NAME_LENGTH) {
    return `Tên file quá dài (tối đa ${MAX_FILE_NAME_LENGTH} ký tự)`;
  }
  return null;
}

export function attachmentLimitError(current: number, adding: number): string | null {
  return current + adding > MAX_ATTACHMENTS
    ? `Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS} file`
    : null;
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
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}

/**
 * Upload multiple files and return all download URLs.
 */
export async function uploadJobAttachments(
  jobId: string,
  files: File[]
): Promise<string[]> {
  const results = await Promise.allSettled(files.map((f) => uploadJobAttachment(jobId, f)));
  const urls = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (urls.length < results.length) {
    // Một tệp lỗi: xoá các tệp đã tải lên để không để lại tệp mồ côi.
    await deleteAttachments(urls);
    throw new Error(ATTACHMENT_UPLOAD_ERROR);
  }
  return urls;
}

/**
 * Delete a file by its download URL.
 */
export async function deleteAttachment(downloadUrl: string): Promise<void> {
  const fileRef = ref(storage, downloadUrl);
  await deleteObject(fileRef);
}

/** Best effort: delete several files by download URL, never throws. */
export async function deleteAttachments(downloadUrls: string[]): Promise<void> {
  await Promise.allSettled(downloadUrls.map((u) => deleteAttachment(u)));
}
