// RL-06 log file, FR-52 main-process AI, SR-06 security rules and the menu.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDesktopSummary, testAiConnection, type AiDeps } from '../src/main/ai';
import { createFileLogger, LOG_FILE } from '../src/main/logger';
import { buildMenuTemplate } from '../src/main/menu';
import {
  DESKTOP_CSP,
  hardenSession,
  hardenWebContents,
  isAppUrl,
  isSafeExternalUrl,
  resolveAppFile,
  responseHeaders,
} from '../src/main/security';
import { aiSummary, memoryLogger, validRequest } from './fixtures';

describe('log file (RL-06)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'evm-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('UT-LOG-01 writes timestamped lines and redacts API keys and secrets', () => {
    const log = createFileLogger(dir, {
      secrets: () => ['my-secret'],
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    log.info('Started');
    log.error('Gemini failed', new Error('key AIzaSyABCDEFGHIJKLMNOPQRSTUVWX rejected, my-secret'));
    const text = readFileSync(path.join(dir, LOG_FILE), 'utf8');
    expect(text).toContain('2026-01-01T00:00:00.000Z INFO Started');
    expect(text).toContain('ERROR Gemini failed — Error: key [redacted] rejected, [redacted]');
    expect(text).not.toMatch(/AIza|my-secret/);
  });

  it('UT-LOG-02 rotates at the size limit, keeping one previous file', () => {
    const log = createFileLogger(dir, { maxBytes: 200 });
    for (let i = 0; i < 20; i++) log.info(`line ${i} ${'x'.repeat(20)}`);
    const current = readFileSync(path.join(dir, LOG_FILE), 'utf8');
    expect(Buffer.byteLength(current)).toBeLessThanOrEqual(200);
    expect(existsSync(path.join(dir, `${LOG_FILE}.1`))).toBe(true);
    expect(current).toContain('line 19');
  });

  it('UT-LOG-03 never throws, even when the folder cannot be written', () => {
    const log = createFileLogger(path.join(dir, 'file-not-folder', '\0bad'));
    expect(() => log.error('x', new Error('y'))).not.toThrow();
  });
});

describe('AI in the main process (FR-52)', () => {
  const deps = (overrides: Partial<AiDeps> = {}): AiDeps => ({
    getApiKey: () => 'AIzaSyTESTKEY1234',
    getModel: () => 'gemini-test',
    isOnline: () => true,
    log: memoryLogger(),
    createGenerator: () => async () => JSON.stringify(aiSummary),
    ...overrides,
  });

  it('UT-DAI-01 success returns the validated summary and model', async () => {
    const create = vi.fn(() => async () => JSON.stringify(aiSummary));
    expect(await generateDesktopSummary(validRequest, deps({ createGenerator: create }))).toEqual({
      ok: true,
      summary: aiSummary,
      model: 'gemini-test',
    });
    expect(create).toHaveBeenCalledWith({ apiKey: 'AIzaSyTESTKEY1234', model: 'gemini-test' });
  });

  it('UT-DAI-02 no key, no model or offline → fallback reasons without calling the model', async () => {
    const create = vi.fn();
    expect(
      await generateDesktopSummary(
        validRequest,
        deps({ getApiKey: () => null, createGenerator: create }),
      ),
    ).toEqual({ ok: false, reason: 'not-configured' });
    expect(
      await generateDesktopSummary(
        validRequest,
        deps({ getModel: () => '', createGenerator: create }),
      ),
    ).toEqual({ ok: false, reason: 'not-configured' });
    expect(
      await generateDesktopSummary(
        validRequest,
        deps({ isOnline: () => false, createGenerator: create }),
      ),
    ).toEqual({ ok: false, reason: 'network' });
    expect(create).not.toHaveBeenCalled();
  });

  it('UT-DAI-03 timeout, network error, API error and bad output map to fallback reasons', async () => {
    const cases: [AiDeps['createGenerator'], string][] = [
      [() => () => new Promise(() => {}), 'timeout'],
      [
        () => async () => {
          throw new TypeError('fetch failed');
        },
        'network',
      ],
      [
        () => async () => {
          throw new Error('API key not valid');
        },
        'server',
      ],
      [() => async () => 'not json', 'invalid'],
      [() => async () => JSON.stringify({ ...aiSummary, recommendations: ['1'] }), 'invalid'],
    ];
    for (const [createGenerator, reason] of cases) {
      expect(
        await generateDesktopSummary(validRequest, deps({ createGenerator, timeoutMs: 30 })),
      ).toEqual({ ok: false, reason });
    }
  });

  it('UT-DAI-04 Test connection: checks key + model; clear messages for each failure', async () => {
    expect(await testAiConnection(deps({ checkModel: async () => {} }))).toEqual({
      ok: true,
      message: 'Connected. Model “gemini-test” is available.',
    });
    const message = async (error: Error, extra: Partial<AiDeps> = {}) =>
      (
        await testAiConnection(
          deps({
            checkModel: async () => {
              throw error;
            },
            ...extra,
          }),
        )
      ).message;
    expect(await message(new Error('API key not valid. API_KEY_INVALID'))).toMatch(
      /API key was not accepted/,
    );
    expect(await message(new Error('models/x is not found'))).toMatch(/model name was not found/);
    expect(await message(new TypeError('fetch failed'))).toMatch(/Could not reach/);
    expect((await testAiConnection(deps({ getApiKey: () => null }))).message).toMatch(
      /Save a model name and an API key first/,
    );
    expect((await testAiConnection(deps({ isOnline: () => false }))).message).toMatch(
      /No internet connection/,
    );
  });
});

describe('security rules (SR-06)', () => {
  it('UT-SEC-01 only the app (and the dev server in development) is an app URL', () => {
    expect(isAppUrl('app://evm/index.html')).toBe(true);
    expect(isAppUrl('app://evm/#/dashboard')).toBe(true);
    expect(isAppUrl('app://other/index.html')).toBe(false);
    expect(isAppUrl('file:///C:/index.html')).toBe(false);
    expect(isAppUrl('https://evil.example/')).toBe(false);
    expect(isAppUrl('http://127.0.0.1:5173/#/data')).toBe(false);
    expect(isAppUrl('http://127.0.0.1:5173/#/data', 'http://127.0.0.1:5173')).toBe(true);
    expect(isAppUrl('not a url')).toBe(false);
  });

  it('UT-SEC-02 only https links open externally', () => {
    expect(isSafeExternalUrl('https://aistudio.google.com/apikey')).toBe(true);
    for (const url of [
      'http://example.com',
      'file:///C:/Windows/system32/calc.exe',
      'javascript:alert(1)',
      'mailto:a@b.c',
      'https://user:pw@example.com',
      'ms-settings:',
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(false);
    }
  });

  it('UT-SEC-03 navigation away is blocked, https opens in the browser, new windows are denied', () => {
    const listeners = new Map<string, (event: { preventDefault(): void }, url: string) => void>();
    let windowOpen: (details: { url: string }) => { action: string } = () => ({ action: 'allow' });
    const contents = {
      on: vi.fn((name: string, fn: never) => listeners.set(name, fn)),
      setWindowOpenHandler: vi.fn((fn: typeof windowOpen) => {
        windowOpen = fn;
      }),
    };
    const openExternal = vi.fn();
    hardenWebContents(contents as never, { openExternal, log: { info: vi.fn() } });

    const navigate = (url: string) => {
      const event = { preventDefault: vi.fn() };
      listeners.get('will-navigate')!(event, url);
      return event.preventDefault.mock.calls.length > 0;
    };
    expect(navigate('app://evm/index.html#/report')).toBe(false);
    expect(navigate('https://example.com')).toBe(true);
    expect(navigate('file:///C:/secret.txt')).toBe(true);
    expect(openExternal.mock.calls).toEqual([['https://example.com']]);
    expect(listeners.has('will-redirect')).toBe(true);

    const attach = { preventDefault: vi.fn() };
    listeners.get('will-attach-webview')!(attach, '');
    expect(attach.preventDefault).toHaveBeenCalled();

    expect(windowOpen({ url: 'https://aistudio.google.com' })).toEqual({ action: 'deny' });
    expect(windowOpen({ url: 'app://evm/index.html' })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenLastCalledWith('https://aistudio.google.com');
  });

  it('UT-SEC-04 every permission request and check is denied', () => {
    let request: (
      wc: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void = () => {};
    let check: () => boolean = () => true;
    hardenSession({
      setPermissionRequestHandler: (fn: never) => {
        request = fn;
      },
      setPermissionCheckHandler: (fn: never) => {
        check = fn;
      },
    } as never);
    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read']) {
      const callback = vi.fn();
      request(null, permission, callback);
      expect(callback).toHaveBeenCalledWith(false);
    }
    expect(check()).toBe(false);
  });

  it('UT-SEC-05 app:// only serves files inside the web build (no traversal)', () => {
    const root = path.resolve('/app/dist/web');
    expect(resolveAppFile(root, 'app://evm/')).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://evm/index.html')).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://evm/assets/index-abc.js')).toBe(
      path.join(root, 'assets', 'index-abc.js'),
    );
    // The URL parser collapses "../" and "%2e%2e/", so these stay inside the build folder.
    expect(resolveAppFile(root, 'app://evm/../../secret.txt')).toBe(path.join(root, 'secret.txt'));
    expect(resolveAppFile(root, 'app://evm/%2e%2e/%2e%2e/secret.txt')).toBe(
      path.join(root, 'secret.txt'),
    );
    // Encoded backslashes survive URL parsing and would escape on Windows: refused.
    expect(resolveAppFile(root, 'app://evm/..%5c..%5csecret.txt')).toBeNull();
    expect(resolveAppFile(root, 'app://evm/assets/..%5c..%5c..%5cwindows%5cwin.ini')).toBeNull();
    // Whatever the input, a resolved file is never outside the web build.
    for (const attack of [
      '%2e%2e%2f%2e%2e%2fx',
      '..%2f..%2fx',
      '%5c..%5c..%5cx',
      '....//....//x',
    ]) {
      const file = resolveAppFile(root, `app://evm/${attack}`);
      expect(file === null || file.startsWith(root + path.sep), attack).toBe(true);
    }
    expect(resolveAppFile(root, 'app://evm/%00')).toBeNull();
    expect(resolveAppFile(root, 'app://other/index.html')).toBeNull();
    expect(resolveAppFile(root, 'app://evm/%E0%A4%A')).toBeNull();
  });

  it('UT-SEC-06 responses carry the strict desktop CSP', () => {
    const headers = responseHeaders('/x/index.html');
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(headers['Content-Security-Policy']).toBe(DESKTOP_CSP);
    expect(DESKTOP_CSP).toContain("default-src 'none'");
    expect(DESKTOP_CSP).toContain("connect-src 'self'");
    expect(DESKTOP_CSP).toContain("frame-ancestors 'none'");
    expect(DESKTOP_CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    expect(responseHeaders('/x/a.woff2')['Content-Type']).toBe('font/woff2');
  });
});

describe('menu (SR-06)', () => {
  const labels = (isDev: boolean) => {
    const template = buildMenuTemplate({
      isDev,
      send: vi.fn(),
      showAbout: vi.fn(),
      openLogFolder: vi.fn(),
    });
    return template.map((m) => ({
      menu: m.label,
      items: (m.submenu as { label?: string; role?: string }[]).map(
        (i) => i.label ?? i.role ?? '-',
      ),
    }));
  };

  it('UT-MENU-01 File, View and Help; no developer tools in production', () => {
    expect(labels(false)).toEqual([
      {
        menu: '&File',
        items: ['&Open project…', '&Save project…', '&Export report…', '-', '&Quit'],
      },
      { menu: '&View', items: ['Toggle &theme'] },
      { menu: '&Help', items: ['&About EVM Cost Tracker', 'Open &log folder'] },
    ]);
    expect(labels(true)[1]!.items).toContain('toggleDevTools');
  });

  it('UT-MENU-02 menu items send their command to the page', () => {
    const send = vi.fn();
    const openLogFolder = vi.fn();
    const template = buildMenuTemplate({ isDev: false, send, showAbout: vi.fn(), openLogFolder });
    const item = (menu: number, index: number) =>
      (template[menu]!.submenu as { click?: () => void }[])[index]!.click!();
    item(0, 0);
    item(0, 1);
    item(0, 2);
    item(1, 0);
    item(2, 1);
    expect(send.mock.calls.flat()).toEqual([
      'open-project',
      'save-project',
      'export-report',
      'toggle-theme',
    ]);
    expect(openLogFolder).toHaveBeenCalled();
  });
});
