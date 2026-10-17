import { describe, expect, it } from 'vitest';
import { assertAppProject, assertEmulatorEnv } from '../support/emulator.js';

const base = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-unijob' };

describe('assertEmulatorEnv', () => {
  it('passes with an emulator host and a demo- project', () => {
    expect(() => assertEmulatorEnv(base)).not.toThrow();
  });

  it.each(['127.0.0.1:8080', 'localhost:8080', '[::1]:8080'])('accepts the local emulator host %s', (host) => {
    expect(() => assertEmulatorEnv({ ...base, FIRESTORE_EMULATOR_HOST: host })).not.toThrow();
  });

  it('throws when FIRESTORE_EMULATOR_HOST is missing', () => {
    expect(() => assertEmulatorEnv({ GCLOUD_PROJECT: 'demo-unijob' })).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });

  it.each([
    'firestore.googleapis.com:443',
    'emulator.example.com:8080',
    '10.0.0.5:8080',
    'localhost',
    'localhost:8080/x',
    'http://localhost:8080',
    ' localhost:8080',
    'localhost.evil.com:8080',
  ])('throws for the non-local emulator host %j', (host) => {
    expect(() => assertEmulatorEnv({ ...base, FIRESTORE_EMULATOR_HOST: host })).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });

  it('throws when GOOGLE_APPLICATION_CREDENTIALS is set', () => {
    expect(() => assertEmulatorEnv({ ...base, GOOGLE_APPLICATION_CREDENTIALS: '/keys/sa.json' })).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
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

  it('throws when the app has no explicit projectId, even if GCLOUD_PROJECT says demo-', () => {
    const saved = process.env.GCLOUD_PROJECT;
    process.env.GCLOUD_PROJECT = 'demo-unijob';
    try {
      expect(() => assertAppProject({ options: {} })).toThrow(/projectId/);
      expect(() => assertAppProject({ options: { projectId: undefined } })).toThrow(/projectId/);
    } finally {
      process.env.GCLOUD_PROJECT = saved;
    }
  });

  it('throws for a non-demo app project', () => {
    expect(() => assertAppProject({ options: { projectId: 'unijob-prod' } })).toThrow(/demo-/);
    expect(() => assertAppProject({ options: { projectId: 'my-demo-unijob' } })).toThrow(/demo-/);
  });
});
