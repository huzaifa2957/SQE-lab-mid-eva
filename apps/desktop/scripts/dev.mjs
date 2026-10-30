// `npm run dev -w apps/desktop`: starts the web dev server, builds main + preload and
// launches Electron pointing at the dev server. Closing the window stops everything.

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webDir = fileURLToPath(new URL('../../web', import.meta.url));
const url = 'http://127.0.0.1:5173';
const children = [];

function run(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', shell: true, ...options });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill();
  }
}
process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});

run('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: webDir });

for (let i = 0; ; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    if (i > 120) throw new Error(`The web dev server did not start on ${url}`);
  }
  await delay(500);
}

await new Promise((resolve, reject) =>
  run('node', ['scripts/build.mjs', '--dev'], { cwd: root }).on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error('Desktop build failed')),
  ),
);

const electron = run('npx', ['electron', '.'], {
  cwd: root,
  env: { ...process.env, EVM_DEV_SERVER_URL: url },
});
electron.on('exit', () => {
  stopAll();
  process.exit(0);
});
