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

const COMPLETED_WRITE = /\b(updateJob|updateDoc|setDoc|addDoc|set|update)\s*\([^;]*?status:\s*['"]completed['"]/s;

describe('the completed-write pattern', () => {
  it('matches writes and not read filters', () => {
    expect(COMPLETED_WRITE.test("await updateJob(job.id, { status: 'completed' });")).toBe(true);
    expect(COMPLETED_WRITE.test("batch.update(ref, {\n  status: 'completed',\n});")).toBe(true);
    expect(COMPLETED_WRITE.test("getJobs({ status: 'completed' }),")).toBe(false);
  });
});

describe('no client code writes completions, work history or completed status', () => {
  const files = sourceFiles(SRC);
  it.each(files.map((f) => [relative(SRC, f), f]))('%s', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(createJobCompletion|recordWorkHistory)\b/);
    expect(text).not.toMatch(COMPLETED_WRITE);
  });
  it('only rating.service.ts touches jobCompletions, and only with getDoc', () => {
    const users = files.filter((f) => readFileSync(f, 'utf8').includes("'jobCompletions'")).map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(users).toEqual(['services/rating.service.ts']);
    const text = readFileSync(join(SRC, 'services', 'rating.service.ts'), 'utf8');
    const refs = text.match(/doc\(db,\s*'jobCompletions'/g) ?? [];
    const reads = text.match(/getDoc\(doc\(db,\s*'jobCompletions'/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(reads.length).toBe(refs.length);
  });
  it('workHistory.service.ts has no Firestore write API', () => {
    const text = readFileSync(join(SRC, 'services', 'workHistory.service.ts'), 'utf8');
    expect(text).not.toMatch(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  });
});
