// Electron smoke test (FR-50, SR-06): the built app launches from local files, the sample
// project loads and the dashboard shows the sample CPI. Also checks the security settings
// from inside the running app.
//
//   npm run build -w apps/desktop && npm run test:e2e -w apps/desktop

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import type { EvmDesktopApi } from '@evm/platform/bridge';

declare global {
  interface Window {
    evmDesktop?: EvmDesktopApi;
  }
}

// Playwright compiles this file as CommonJS (the desktop package is not an ES module).
const desktopDir = path.join(__dirname, '..');
let app: ElectronApplication;
let page: Page;
let profile: string;

test.beforeAll(async () => {
  profile = mkdtempSync(path.join(tmpdir(), 'evm-e2e-'));
  app = await electron.launch({
    args: ['.'],
    cwd: desktopDir,
    // A throw-away profile, and never the dev server.
    env: { ...process.env, EVM_USER_DATA_DIR: profile, EVM_DEV_SERVER_URL: '' },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
});

test('E2E-DESK-01 launches from local files with the hardened settings (SR-06)', async () => {
  expect(page.url()).toBe('app://evm/index.html');
  await expect(page).toHaveTitle('EVM Cost Tracker');

  const prefs = await app.evaluate(({ BrowserWindow }) => {
    // Not in Electron's public typings, but available at runtime for exactly this check.
    const contents = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
      getLastWebPreferences(): Record<string, unknown>;
    };
    const p = contents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
      webSecurity: p.webSecurity,
    };
  });
  expect(prefs).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });

  // Only the narrow bridge is visible to the page — no Node, no ipcRenderer.
  const exposed = await page.evaluate(() => ({
    bridge: Object.keys(window.evmDesktop ?? {}).sort(),
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
  }));
  expect(exposed.require).toBe('undefined');
  expect(exposed.process).toBe('undefined');
  expect(exposed.bridge).toEqual([
    'generateAiSummary',
    'getAppVersion',
    'getSettings',
    'onMenuCommand',
    'openProjectFile',
    'saveProjectFile',
    'saveReport',
    'saveSettings',
    'testAiConnection',
  ]);
  expect(await page.evaluate(() => window.evmDesktop!.getAppVersion())).toMatch(/^\d+\.\d+\.\d+/);
});

test('E2E-DESK-02 the sample project loads and the dashboard shows CPI 0.87', async () => {
  await page.getByRole('button', { name: 'Load sample project' }).first().click();
  await expect(page.getByTestId('current-project')).toHaveText(/Clinic Building Extension/);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Dashboard' })
    .click();
  // CPI = EV / AC = 496,000 / 570,000 = 0.87
  await expect(
    page.getByRole('group', { name: 'CPI', exact: true }).getByTestId('metric-value'),
  ).toHaveText('0.87');
});

test('E2E-DESK-03 the desktop Settings page shows the Gemini key section', async () => {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { name: 'Desktop: Gemini API key' })).toBeVisible();
  await expect(page.getByText('No key saved')).toBeVisible();
});

// Runs last: the blocked navigation never completes, which Playwright then waits on.
test('E2E-DESK-04 navigation away from the app and new windows are blocked (SR-06)', async () => {
  await page.evaluate(() => {
    window.location.href = 'http://example.invalid/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/^app:\/\/evm\//);

  await page.evaluate(() => window.open('http://example.invalid/', '_blank'));
  await page.waitForTimeout(500);
  expect(app.windows()).toHaveLength(1);
});
