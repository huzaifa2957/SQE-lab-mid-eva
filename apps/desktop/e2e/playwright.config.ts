import { defineConfig } from '@playwright/test';

// Electron smoke test (Phase 7). Needs the built app: npm run build -w apps/desktop
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
