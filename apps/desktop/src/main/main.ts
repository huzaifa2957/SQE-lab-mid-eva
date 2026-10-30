// Electron main process (FR-50…FR-53, SR-06, RL-06). Loads the apps/web build from local
// files through the private app:// protocol and adds the small desktop platform layer.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import { IPC_CHANNELS } from '@evm/platform/channels';
import { generateDesktopSummary, testAiConnection } from './ai';
import { registerIpcHandlers } from './ipc';
import { createFileLogger } from './logger';
import { buildMenuTemplate } from './menu';
import {
  APP_ENTRY,
  APP_ORIGIN,
  APP_SCHEME,
  hardenSession,
  hardenWebContents,
  isAppUrl,
  isSafeExternalUrl,
  resolveAppFile,
  responseHeaders,
} from './security';
import { SettingsStore } from './settings';

const APP_NAME = 'EVM Cost Tracker';
/** Set by `npm run dev` only; ignored in the packaged app. */
const devServerUrl = app.isPackaged ? undefined : process.env.EVM_DEV_SERVER_URL || undefined;

// Tests (and `npm run dev`) can use a throw-away profile; never in the packaged app.
if (!app.isPackaged && process.env.EVM_USER_DATA_DIR) {
  app.setPath('userData', process.env.EVM_USER_DATA_DIR);
}
app.setName(APP_NAME);

// Must run before the app is ready: app:// behaves like https (secure origin, IndexedDB).
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();

const userData = app.getPath('userData');
const log = createFileLogger(path.join(userData, 'logs'), { echo: !app.isPackaged });
const settings = new SettingsStore(path.join(userData, 'settings.json'), safeStorage);
const webRoot = path.join(app.getAppPath(), 'dist', 'web');
const iconPath = path.join(app.getAppPath(), 'dist', 'icon.png');

let mainWindow: BrowserWindow | null = null;

process.on('uncaughtException', (error) => log.error('Uncaught exception', error));
process.on('unhandledRejection', (error) => log.error('Unhandled rejection', error));

function openExternal(url: string) {
  if (isSafeExternalUrl(url)) void shell.openExternal(url);
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(webRoot, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await fsp.readFile(file);
      return new Response(body, { status: 200, headers: responseHeaders(file) });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    icon: iconPath,
    backgroundColor: '#F4F5EF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => log.info('Page loaded'));
  mainWindow.webContents.on('did-fail-load', (_event, code, description) =>
    log.error(`Page failed to load (${code} ${description})`),
  );
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(devServerUrl ?? APP_ENTRY);
}

function showAbout() {
  void dialog.showMessageBox({
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: `Version ${app.getVersion()}\nEarned Value Management cost tracker.\nYour data stays on this computer.`,
    buttons: ['OK'],
  });
}

// Every web contents (window, devtools) gets the navigation and new-window guards.
app.on('web-contents-created', (_event, contents) => {
  hardenWebContents(contents, { devServerUrl, openExternal, log });
});

app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});

app.on('window-all-closed', () => app.quit());

void app.whenReady().then(() => {
  log.info(`Started ${APP_NAME} ${app.getVersion()}${devServerUrl ? ' (development)' : ''}`);
  hardenSession(session.defaultSession);
  registerAppProtocol();

  registerIpcHandlers(ipcMain, {
    dialog,
    fs: {
      readFile: (file, encoding) => fsp.readFile(file, encoding),
      writeFile: (file, data) => fsp.writeFile(file, data),
      stat: (file) => fsp.stat(file),
    },
    defaultDir: app.getPath('documents'),
    isTrustedSender: (url) => isAppUrl(url, devServerUrl),
    settings,
    ai: {
      generate: (request) =>
        generateDesktopSummary(request, {
          getApiKey: () => settings.getApiKey(),
          getModel: () => settings.getModel(),
          isOnline: () => net.isOnline(),
          log,
        }),
      test: () =>
        testAiConnection({
          getApiKey: () => settings.getApiKey(),
          getModel: () => settings.getModel(),
          isOnline: () => net.isOnline(),
          log,
        }),
    },
    appVersion: app.getVersion(),
    log,
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate({
        isDev: !app.isPackaged,
        send: (command) => mainWindow?.webContents.send(IPC_CHANNELS.menuCommand, command),
        showAbout,
        openLogFolder: () => void shell.openPath(log.dir),
      }),
    ),
  );

  createWindow();
  log.info(`Loading the app from ${devServerUrl ? 'the dev server' : APP_ORIGIN}`);
});
