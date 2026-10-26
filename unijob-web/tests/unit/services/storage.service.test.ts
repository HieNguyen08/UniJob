import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn().mockResolvedValue(undefined),
  getDownloadURL: vi.fn().mockResolvedValue('https://example.com/f'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/firebase', () => ({ storage: 'STORAGE' }));

import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_TYPES,
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_SIZE_BYTES,
  ATTACHMENT_UPLOAD_ERROR,
  attachmentLimitError,
  deleteAttachments,
  uploadJobAttachment,
  uploadJobAttachments,
  validateFile,
} from '@/services/storage.service';

const file = (name: string, size: number, type: string) => ({ name, size, type }) as File;

describe('validateFile', () => {
  it('accepts exactly 10 MB and rejects one byte more', () => {
    expect(validateFile(file('a.pdf', MAX_FILE_SIZE_BYTES, 'application/pdf'))).toBeNull();
    expect(validateFile(file('a.pdf', MAX_FILE_SIZE_BYTES + 1, 'application/pdf'))).toBe('File "a.pdf" vượt quá 10MB');
  });
  it('rejects types outside the allowlist (svg, html, empty)', () => {
    for (const t of ['image/svg+xml', 'text/html', '']) {
      expect(validateFile(file('a', 1, t))).toBe('File "a" không được hỗ trợ');
    }
  });
  it('rejects names longer than MAX_FILE_NAME_LENGTH, accepts a 100-character Vietnamese name', () => {
    expect(validateFile(file('ệ'.repeat(96) + '.pdf', 1, 'application/pdf'))).toBeNull();
    expect(validateFile(file('a'.repeat(97) + '.pdf', 1, 'application/pdf'))).toBe(
      `Tên file quá dài (tối đa ${MAX_FILE_NAME_LENGTH} ký tự)`,
    );
  });
});

describe('validateFile extensions', () => {
  it('requires an allowed extension, in any case', () => {
    expect(validateFile(file('A.PDF', 1, 'application/pdf'))).toBeNull();
    expect(validateFile(file('x.tar.Docx', 1, 'application/pdf'))).toBeNull();
    for (const n of ['x.exe', 'x.svg', 'x.html', 'x', '.pdf.exe']) {
      expect(validateFile(file(n, 1, 'application/pdf'))).toBe(`File "${n}" không được hỗ trợ`);
    }
  });
});

describe('attachmentLimitError', () => {
  it('allows up to 10 files and refuses the 11th', () => {
    expect(attachmentLimitError(0, 10)).toBeNull();
    expect(attachmentLimitError(9, 1)).toBeNull();
    expect(attachmentLimitError(10, 1)).toBe('Chỉ được đính kèm tối đa 10 file');
    expect(attachmentLimitError(3, 8)).toBe('Chỉ được đính kèm tối đa 10 file');
  });
});

describe('uploadJobAttachment', () => {
  it('writes jobs/{jobId}/attachments/{13 digits}_{name} with the file content type', async () => {
    const f = file('cv.pdf', 5, 'application/pdf');
    await uploadJobAttachment('j1', f);
    expect(ref).toHaveBeenCalledWith('STORAGE', expect.stringMatching(/^jobs\/j1\/attachments\/\d{13}_cv\.pdf$/));
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), f, { contentType: 'application/pdf' });
  });
});

describe('uploadJobAttachments', () => {
  const f = (n: string) => file(n, 5, 'application/pdf');
  it('returns all URLs when every upload succeeds', async () => {
    vi.mocked(getDownloadURL).mockResolvedValue('https://u/ok');
    await expect(uploadJobAttachments('j1', [f('a.pdf'), f('b.pdf')])).resolves.toEqual(['https://u/ok', 'https://u/ok']);
  });
  it('deletes the files that did upload and throws a Vietnamese error when one fails', async () => {
    vi.mocked(deleteObject).mockClear();
    vi.mocked(getDownloadURL).mockResolvedValue('https://u/ok');
    vi.mocked(uploadBytes).mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error('403'));
    await expect(uploadJobAttachments('j1', [f('a.pdf'), f('b.pdf')])).rejects.toThrow(ATTACHMENT_UPLOAD_ERROR);
    expect(ref).toHaveBeenCalledWith('STORAGE', 'https://u/ok');
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe('deleteAttachments', () => {
  it('is best effort: one failing delete does not reject', async () => {
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    await expect(deleteAttachments(['https://u/1', 'https://u/2'])).resolves.toBeUndefined();
  });
});

describe('storage.rules stays in sync with the client limits', () => {
  const rules = readFileSync(join(process.cwd(), 'storage.rules'), 'utf8');
  it('allows exactly ALLOWED_TYPES', () => {
    const list = rules.match(/request\.resource\.contentType in \[([^\]]*)\]/)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...ALLOWED_TYPES].sort());
  });
  it('allows exactly ALLOWED_EXTENSIONS in the file name pattern', () => {
    const alt = rules.match(/fileName\.matches\('\(\?i\)[^']*\x5c\x5c\.\(([^)]*)\)\$'\)/)?.[1] ?? '';
    const fromRules = alt.split('|').flatMap((e) => (e.includes('?') ? [e.replace('?', ''), e.replace(/.\?/, '')] : [e]));
    expect(fromRules.sort()).toEqual([...ALLOWED_EXTENSIONS].sort());
  });
  it('caps size at MAX_FILE_SIZE_BYTES and names at 200 (prefix + MAX_FILE_NAME_LENGTH fits)', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(rules).toContain('request.resource.size <= 10 * 1024 * 1024');
    expect(rules).toContain('fileName.size() <= 200');
    expect(14 + MAX_FILE_NAME_LENGTH).toBeLessThanOrEqual(200);
  });
});
