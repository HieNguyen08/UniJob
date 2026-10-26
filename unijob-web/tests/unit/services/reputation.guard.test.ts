import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// These are source tripwires only (cheap regression alarms); the Firestore rules tests are the real guarantee.
// addDoc may create a job with status 'open' (createJob); only 'cancelled' is flagged there.
const STATUS_WRITE =
  /\b(updateJob|updateDoc|setDoc|set|update)\s*\([^;]*?status:\s*['"](cancelled|open)['"]|\baddDoc\s*\([^;]*?status:\s*['"]cancelled['"]/s;
const DEFAULTS: Record<string, string> = { ratingScore: '0', totalRatings: '0', activeJobCount: '0', maxJobLimit: '2', ratingAverage: '0', penaltyPoints: '0', completedJobs: '0' };

describe('the cancelled-write pattern', () => {
  it('matches writes and not reads', () => {
    expect(STATUS_WRITE.test("await updateJob(jobId, { status: 'cancelled' });")).toBe(true);
    expect(STATUS_WRITE.test("updateDoc(ref, {\n  status: 'cancelled',\n})")).toBe(true);
    expect(STATUS_WRITE.test("await updateJob(jobId, { status: 'open' });")).toBe(true);
    expect(STATUS_WRITE.test("status === 'cancelled' ? 'Đã huỷ' : ''")).toBe(false);
    expect(STATUS_WRITE.test("getJobs({ status: 'open' }),")).toBe(false);
  });
});

describe('no client code writes reputation, counters or cancels', () => {
  const files = sourceFiles(SRC);
  const rel = (f: string) => relative(SRC, f).replaceAll('\\', '/');
  it.each(files.map((f) => [rel(f), f]))('%s', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(workerCancelJob|posterCancelJob|incrementActiveJobs|decrementActiveJobs)\b/);
    expect(text).not.toMatch(STATUS_WRITE);
  });
  it('only auth, bookmark and user services touch the users collection', () => {
    expect(files.filter((f) => /['"`]users[/'"`]/.test(readFileSync(f, 'utf8'))).map(rel).sort())
      .toEqual(['services/auth.service.ts', 'services/bookmark.service.ts', 'services/user.service.ts']);
  });
  it('the first sign-in sets server-owned fields only to their defaults', () => {
    const text = readFileSync(join(SRC, 'services', 'auth.service.ts'), 'utf8');
    for (const [field, value] of Object.entries(DEFAULTS)) {
      for (const m of text.matchAll(new RegExp(String.raw`\b${field}\s*:\s*([^,\n]+)`, 'g'))) expect(m[1].trim()).toBe(value);
    }
    expect(text).not.toMatch(/\b(xp|level|badges|role)\s*:/);
  });
  it('bookmark.service writes only bookmarks; user.service takes ProfileEditInput and never increments', () => {
    const bookmark = readFileSync(join(SRC, 'services', 'bookmark.service.ts'), 'utf8');
    expect(bookmark).not.toMatch(new RegExp(String.raw`\b(${Object.keys(DEFAULTS).join('|')})\b`));
    const user = readFileSync(join(SRC, 'services', 'user.service.ts'), 'utf8');
    expect(user).toMatch(/updateUserProfile\(userId: string, data: ProfileEditInput\)/);
    expect(user).not.toMatch(/\bincrement\s*\(/);
  });
  it('cancel.service.ts has no Firestore or service imports', () => {
    expect(readFileSync(join(SRC, 'services', 'cancel.service.ts'), 'utf8')).not.toMatch(/firebase\/firestore|user\.service|job\.service/);
  });
});
