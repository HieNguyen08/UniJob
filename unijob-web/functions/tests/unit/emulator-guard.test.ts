import { describe, expect, it } from 'vitest';
import { assertAppProject, assertEmulatorEnv } from '../support/emulator.js';

const base = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-unijob' };

describe('assertEmulatorEnv', () => {
  it('passes with an emulator host and a demo- project', () => {
    expect(() => assertEmulatorEnv(base)).not.toThrow();
  });

  it('throws when FIRESTORE_EMULATOR_HOST is missing', () => {
    expect(() => assertEmulatorEnv({ GCLOUD_PROJECT: 'demo-unijob' })).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });

  it('throws when the project is not a demo- project', () => {
    expect(() => assertEmulatorEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'unijob-prod' })).toThrow(/demo-/);
    expect(() => assertEmulatorEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/demo-/);
  });

  it('does not require the Auth emulator by default', () => {
    expect(() => assertEmulatorEnv(base)).not.toThrow();
  });

  it('requires FIREBASE_AUTH_EMULATOR_HOST when the test opts in with { auth: true }', () => {
    expect(() => assertEmulatorEnv(base, { auth: true })).toThrow(/FIREBASE_AUTH_EMULATOR_HOST/);
    expect(() => assertEmulatorEnv({ ...base, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, { auth: true })).not.toThrow();
  });
});

describe('assertAppProject', () => {
  it('passes for a demo- project in the app options', () => {
    expect(() => assertAppProject({ options: { projectId: 'demo-unijob' } })).not.toThrow();
  });

  it('falls back to GCLOUD_PROJECT when the app has no explicit projectId', () => {
    expect(() => assertAppProject({ options: {} }, { GCLOUD_PROJECT: 'demo-unijob' })).not.toThrow();
  });

  it('throws for a non-demo app project even if the env says demo-', () => {
    expect(() => assertAppProject({ options: { projectId: 'unijob-prod' } }, { GCLOUD_PROJECT: 'demo-unijob' })).toThrow(/demo-/);
  });

  it('throws when no project can be determined', () => {
    expect(() => assertAppProject({ options: {} }, {})).toThrow(/demo-/);
  });
});
