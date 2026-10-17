import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATABASE_ID, REGION } from '../../src/config.js';

const firebaseJson = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

describe('functions config', () => {
  it('REGION is asia-southeast1', () => {
    expect(REGION).toBe('asia-southeast1');
  });

  it('firebase.json firestore database equals DATABASE_ID', () => {
    expect(firebaseJson.firestore.database).toBe(DATABASE_ID);
    expect(DATABASE_ID).toBe('kirigitejkf8095h');
  });

  it('firebase.json declares the functions source, nodejs22 runtime and a predeploy build', () => {
    expect(firebaseJson.functions).toMatchObject({ source: 'functions', runtime: 'nodejs22' });
    expect(firebaseJson.functions.predeploy.join(' ')).toContain('run build');
  });

  it('firebase.json emulators: functions 5001, auth 9099, firestore 8080', () => {
    expect(firebaseJson.emulators.functions.port).toBe(5001);
    expect(firebaseJson.emulators.auth.port).toBe(9099);
    expect(firebaseJson.emulators.firestore.port).toBe(8080);
  });

  it('package engines.node matches the firebase.json runtime', () => {
    expect(`nodejs${pkg.engines.node}`).toBe(firebaseJson.functions.runtime);
  });

  it('package main points at the build output', () => {
    expect(pkg.main).toBe('lib/index.js');
  });

  it('every dependency is pinned to an exact version', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
