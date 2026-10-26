import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentName, isJobAttachmentUrl } from '@/lib/attachments';

const BUCKET = 'unijob-ad6eb.appspot.com';
const url = (jobId: string, name = '1761400000000_cv.pdf', bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/jobs%2F${jobId}%2Fattachments%2F${encodeURIComponent(name)}?alt=media&token=abc-123`;

beforeEach(() => vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', BUCKET));
afterEach(() => vi.unstubAllEnvs());

describe('isJobAttachmentUrl', () => {
  it('accepts a download URL under the job\'s own attachments folder in our bucket', () => {
    expect(isJobAttachmentUrl(url('j1'), 'j1')).toBe(true);
  });
  it('rejects another bucket (attacker-hosted file under the same path)', () => {
    expect(isJobAttachmentUrl(url('j1', undefined, 'attacker.appspot.com'), 'j1')).toBe(false);
    expect(isJobAttachmentUrl(url('j1', undefined, `${BUCKET}.evil.com`), 'j1')).toBe(false);
  });
  it('renders no links at all when the bucket env is missing', () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', '');
    expect(isJobAttachmentUrl(url('j1'), 'j1')).toBe(false);
  });
  it('rejects another job, another host, other schemes and garbage', () => {
    expect(isJobAttachmentUrl(url('j2'), 'j1')).toBe(false);
    expect(isJobAttachmentUrl(url('j1').replace('firebasestorage.googleapis.com', 'evil.example.com'), 'j1')).toBe(false);
    expect(isJobAttachmentUrl('javascript:alert(1)', 'j1')).toBe(false);
    expect(isJobAttachmentUrl(url('j1').replace('https://', 'http://'), 'j1')).toBe(false);
    expect(isJobAttachmentUrl('not a url', 'j1')).toBe(false);
    expect(isJobAttachmentUrl(url('j1x'), 'j1')).toBe(false);
  });
});

describe('attachmentName', () => {
  it('returns the decoded file name, or a numbered fallback', () => {
    expect(attachmentName(url('j1', '1761400000000_Báo cáo.pdf'), 0)).toBe('1761400000000_Báo cáo.pdf');
    expect(attachmentName('', 2)).toBe('file-3');
  });
});
