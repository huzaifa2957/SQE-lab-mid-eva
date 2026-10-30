// SR-06: navigation, new-window, permission and CSP rules for the desktop app, plus safe
// file serving for the app:// protocol. Electron objects are passed in so this is testable.

import path from 'node:path';
import type { Session, WebContents } from 'electron';

export const APP_SCHEME = 'app';
export const APP_HOST = 'evm';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY = `${APP_ORIGIN}/index.html`;

/**
 * Strict CSP sent with every app:// response. The renderer needs no network access: AI and
 * files go through IPC, so connect-src is 'self' only. (The web build's own meta CSP still
 * applies too; the browser enforces both.)
 */
export const DESKTOP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Only the app itself (and the Vite dev server while developing) may be shown. */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  try {
    const parsed = new URL(url);
    if (`${parsed.protocol}//${parsed.host}` === APP_ORIGIN) return true;
    return devServerUrl !== undefined && parsed.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

/** External links open in the default browser only when they are https. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

/** Deny every permission request and check (camera, microphone, notifications, …). */
export function hardenSession(
  session: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

export interface HardenOptions {
  devServerUrl?: string;
  openExternal: (url: string) => void;
  log: { info(message: string): void };
}

/** Blocks navigation away from the app, new windows and <webview>s. */
export function hardenWebContents(
  contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  options: HardenOptions,
): void {
  const guard = (event: { preventDefault(): void }, url: string) => {
    if (isAppUrl(url, options.devServerUrl)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) options.openExternal(url);
    else options.log.info('Blocked navigation to a non-https URL');
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) options.openExternal(url);
    return { action: 'deny' };
  });
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export function mimeType(file: string): string {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Maps an app:// URL to a file inside the web build, or null when it is not allowed
 * (another host, or a path that escapes the folder — e.g. "../", encoded "%2e%2e").
 */
export function resolveAppFile(webRoot: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (`${parsed.protocol}//${parsed.host}` !== APP_ORIGIN) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const relative =
    pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(webRoot);
  const file = path.resolve(root, relative);
  return file.startsWith(root + path.sep) ? file : null;
}

/** Headers for every app:// response. */
export function responseHeaders(file: string): Record<string, string> {
  return {
    'Content-Type': mimeType(file),
    'Content-Security-Policy': DESKTOP_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
