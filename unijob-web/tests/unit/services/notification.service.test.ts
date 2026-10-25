import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import * as service from '@/services/notification.service';

const SRC = join(process.cwd(), 'src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('notification.service', () => {
  it('can only read notifications and mark them read (the server creates them)', () => {
    expect(Object.keys(service).sort()).toEqual(['markAllNotificationsRead', 'markNotificationRead', 'subscribeToNotifications']);
  });
});

describe('no client code writes notifications', () => {
  const files = sourceFiles(SRC);

  it('scans the web sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('%s never calls createNotification or the cleanup service', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\bcreateNotification\b/);
    expect(text).not.toMatch(/cleanup\.service|cleanupExpiredJobs/);
  });

  it('notification.service.ts has no addDoc or setDoc', () => {
    const text = readFileSync(join(SRC, 'services', 'notification.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc)\b/);
  });
});
