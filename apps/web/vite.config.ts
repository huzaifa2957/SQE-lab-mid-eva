/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Origin of the AI proxy URL (e.g. "https://evm-proxy.vercel.app"), or null if unset/invalid. */
export function proxyOrigin(url: string | undefined): string | null {
  try {
    const { origin, protocol } = new URL(url ?? '');
    return protocol === 'https:' || protocol === 'http:' ? origin : null;
  } catch {
    return null;
  }
}

/**
 * SR-05: Content-Security-Policy for the production build. Not added in dev, because the
 * Vite dev server injects an inline React Refresh script. Fonts are self-hosted, so no
 * external font domains are needed. connect-src only allows the AI proxy origin (FR-32).
 */
export function contentSecurityPolicyFor(aiProxyUrl?: string): string {
  const proxy = proxyOrigin(aiProxyUrl);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    proxy ? `connect-src 'self' ${proxy}` : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

function contentSecurityPolicy(aiProxyUrl: string | undefined): Plugin {
  return {
    name: 'evm-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: contentSecurityPolicyFor(aiProxyUrl),
        },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(loadEnv(mode, __dirname, 'VITE_').VITE_AI_PROXY_URL),
  ],
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
    // Whole-app component tests are slow under coverage instrumentation.
    testTimeout: 20_000,
    // Let the contrast test read the design tokens from index.css (?raw).
    css: { include: [/index\.css/] },
  },
}));
