// Generates docs/sample-reports/ from the sample project using the real production build in
// a real browser, so the PDF contains the actual chart images.
//
//   npm run build -w apps/web
//   node scripts/generate-sample-reports.mjs
//
// Uses an installed Chrome or Edge through playwright-core (no browser download).

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../docs/sample-reports/', import.meta.url));
// Not 4173: on some Windows machines that port range is reserved (EACCES).
const port = 3997;
const base = `http://127.0.0.1:${port}/`;

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: `${root}apps/web`,
    shell: true,
    stdio: 'ignore',
  },
);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error('vite preview did not start');
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error('No installed Edge or Chrome found.');
}

try {
  await waitForServer();
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  page.on('pageerror', (error) => console.error('Page error:', error.message));

  await page.goto(`${base}#/projects`);
  await page.getByRole('button', { name: 'Load sample project' }).first().click();
  await page.getByTestId('current-project').waitFor();

  // Offline (rule-based) summary, so the report's AI summary section has content.
  await page.goto(`${base}#/insights`);
  await page.getByRole('button', { name: 'Generate AI summary' }).click();
  await page.getByRole('article', { name: 'Generated summary' }).waitFor();

  await page.goto(`${base}#/report`);
  await page.getByRole('heading', { name: 'Report', level: 1 }).waitFor();
  await delay(1000); // let the off-screen print charts draw

  for (const name of ['Download PDF', 'Excel', 'CSV']) {
    // Each export re-enables the buttons when done; wait for that before the next one.
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    for (let i = 0; i < 120 && !(await button.isEnabled()); i++) await delay(250);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }).catch(async (error) => {
        await page.screenshot({ path: `${outDir}failed-${name}.png` });
        throw error;
      }),
      button.click(),
    ]);
    const target = `${outDir}${download.suggestedFilename()}`;
    await download.saveAs(target);
    console.log(`saved ${target}`);
  }
  await page.screenshot({ path: `${outDir}report-page.png`, fullPage: true });
  await browser.close();
} finally {
  preview.kill();
  if (process.platform === 'win32' && preview.pid) {
    spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}
