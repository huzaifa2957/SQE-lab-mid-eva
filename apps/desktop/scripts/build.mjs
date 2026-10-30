// Bundles the main process and preload with esbuild and copies the apps/web build into
// dist/web. Everything the app needs ends up in dist/, so the installer ships no node_modules.
//
//   node scripts/build.mjs --with-web   build apps/web first, then the desktop app (npm run build)
//   node scripts/build.mjs              desktop app only (expects apps/web/dist to exist)
//   node scripts/build.mjs --dev        main + preload only (the dev server serves the web app)

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dev = process.argv.includes('--dev');
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const webDir = fileURLToPath(new URL('../../web', import.meta.url));
const webDist = `${webDir}/dist`;

if (process.argv.includes('--with-web')) {
  execSync('npm run build', { cwd: webDir, stdio: 'inherit' });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'warning',
  legalComments: 'none',
  sourcemap: dev ? 'inline' : false,
};

await Promise.all([
  build({ ...common, entryPoints: [`${root}src/main/main.ts`], outfile: `${dist}/main.cjs` }),
  // The sandboxed preload may only require('electron'): everything else is bundled in.
  build({
    ...common,
    entryPoints: [`${root}src/preload/preload.ts`],
    outfile: `${dist}/preload.cjs`,
  }),
]);

cpSync(`${root}build/icon.png`, `${dist}/icon.png`);

if (!dev) {
  if (!existsSync(`${webDist}/index.html`)) {
    console.error('apps/web/dist is missing — run "npm run build -w apps/web" first.');
    process.exit(1);
  }
  cpSync(webDist, `${dist}/web`, { recursive: true });
}
console.log(`Built ${dev ? 'main + preload (dev)' : 'desktop app'} into apps/desktop/dist`);
