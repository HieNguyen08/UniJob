export interface EmulatorEnvOptions {
  /** Also require the Auth emulator (for tests that touch Firebase Auth). */
  auth?: boolean;
}

/** Only a loopback emulator: never a remote host that could be (or proxy to) real Firestore. */
const LOCAL_EMULATOR_HOST = /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/;

/** Refuse to run emulator tests anywhere but the local emulator with a demo- project. */
export function assertEmulatorEnv(env: NodeJS.ProcessEnv = process.env, options: EmulatorEnvOptions = {}): void {
  const host = env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set — run emulator tests via `npm run test:functions` in unijob-web');
  }
  if (!LOCAL_EMULATOR_HOST.test(host)) {
    throw new Error(`FIRESTORE_EMULATOR_HOST ${JSON.stringify(host)} is not a local emulator (localhost, 127.0.0.1 or [::1] with a port)`);
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is set — unset it: emulator tests must never hold real credentials');
  }
  if (options.auth && !env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST is not set — start the Auth emulator for this test');
  }
  const project = env.GCLOUD_PROJECT;
  if (!project?.startsWith('demo-')) {
    throw new Error(`refusing to run emulator tests against project ${String(project)} (must start with demo-)`);
  }
}

/**
 * After importing the Admin app: it must carry an explicit demo- projectId. No fallback to the
 * environment — an app without projectId would resolve its project from credentials at runtime.
 */
export function assertAppProject(app: { options: { projectId?: string } }): void {
  const project = app.options.projectId;
  if (project === undefined) {
    throw new Error('refusing to run emulator tests: Admin app has no explicit projectId (initialise it with a demo- projectId first)');
  }
  if (!project.startsWith('demo-')) {
    throw new Error(`refusing to run emulator tests: Admin app project is ${project} (must start with demo-)`);
  }
}
