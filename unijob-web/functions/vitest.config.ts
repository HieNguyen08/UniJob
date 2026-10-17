import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Never a real project: the Admin SDK reads this when no explicit projectId is given.
    env: { GCLOUD_PROJECT: 'demo-unijob' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // cold import of firebase-admin/firestore can exceed the 5 s default
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'emulator',
          include: ['tests/emulator/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
