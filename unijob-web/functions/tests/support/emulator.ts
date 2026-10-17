export interface EmulatorEnvOptions {
  /** Also require the Auth emulator (for tests that touch Firebase Auth). */
  auth?: boolean;
}

/** Refuse to run emulator tests anywhere but the local emulator with a demo- project. */
export function assertEmulatorEnv(env: NodeJS.ProcessEnv = process.env, options: EmulatorEnvOptions = {}): void {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set — run emulator tests via `npm run test:functions` in unijob-web');
  }
  if (options.auth && !env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST is not set — start the Auth emulator for this test');
  }
  const project = env.GCLOUD_PROJECT;
  if (!project?.startsWith('demo-')) {
    throw new Error(`refusing to run emulator tests against project ${String(project)} (must start with demo-)`);
  }
}

/** After importing the Admin app: its project must also be a demo- project. */
export function assertAppProject(app: { options: { projectId?: string } }, env: NodeJS.ProcessEnv = process.env): void {
  const project = app.options.projectId ?? env.GCLOUD_PROJECT;
  if (!project?.startsWith('demo-')) {
    throw new Error(`refusing to run emulator tests: Admin app project is ${String(project)} (must start with demo-)`);
  }
}
