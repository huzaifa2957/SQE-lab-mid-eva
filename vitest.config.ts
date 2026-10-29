import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/web', 'apps/ai-proxy'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
        'apps/ai-proxy/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.*',
        '**/test/**',
        'apps/web/src/main.tsx',
        // process entry points (listen / Vercel bootstrap); the app they build is tested
        'apps/ai-proxy/src/server.ts',
        'apps/ai-proxy/src/vercel.ts',
        '**/*.d.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      // NF-04: core >= 90% lines, overall >= 70%
      thresholds: {
        lines: 70,
        'packages/core/src/**': { lines: 90 },
      },
    },
  },
});
