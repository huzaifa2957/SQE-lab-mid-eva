/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * SR-05: Content-Security-Policy for the production build. Not added in dev, because the
 * Vite dev server injects an inline React Refresh script. Fonts are self-hosted, so no
 * external font domains are needed. connect-src gains the AI proxy origin in Phase 5.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'evm-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  // Relative asset paths so the same build works on static hosting and inside Electron.
  base: './',
  build: {
    // ExcelJS is loaded on demand and is large; that chunk is expected to exceed the default.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Let the contrast test read the design tokens from index.css (?raw).
    css: { include: [/index\.css/] },
  },
});
