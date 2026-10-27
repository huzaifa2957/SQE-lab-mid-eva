import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/test/**', 'apps/web/src/main.tsx', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      // NF-04: core >= 90% lines, overall >= 70%
      thresholds: {
        lines: 70,
        'packages/core/src/**': { lines: 90 },
      },
    },
  },
});
