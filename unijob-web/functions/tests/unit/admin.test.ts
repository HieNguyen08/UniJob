import { getApps } from 'firebase-admin/app';
import { describe, expect, it, vi } from 'vitest';

describe('admin', () => {
  it('binds db to the named database kirigitejkf8095h', async () => {
    const { db, DATABASE_ID } = await import('../../src/admin.js');
    expect(db.databaseId).toBe(DATABASE_ID);
    expect(db.databaseId).toBe('kirigitejkf8095h');
  });

  it('re-exports REGION', async () => {
    const { REGION } = await import('../../src/admin.js');
    expect(REGION).toBe('asia-southeast1');
  });

  it('re-importing after a module reset reuses the existing default app', async () => {
    await import('../../src/admin.js');
    vi.resetModules();
    const again = await import('../../src/admin.js');
    expect(getApps()).toHaveLength(1);
    expect(again.app).toBe(getApps()[0]);
  });
});
