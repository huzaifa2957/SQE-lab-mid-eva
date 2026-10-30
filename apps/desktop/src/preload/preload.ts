// SR-06: the only bridge between the page and Electron. Exposes `window.evmDesktop` with a
// few typed functions; ipcRenderer, fs and other Node APIs are never exposed. Runs sandboxed
// with context isolation, so it can only `require('electron')`.

import { IPC_CHANNELS, MENU_COMMANDS, type MenuCommand } from '@evm/platform/channels';
import type { EvmDesktopApi } from '@evm/platform/bridge';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args);

const api: EvmDesktopApi = {
  openProjectFile: invoke(IPC_CHANNELS.openProjectFile) as EvmDesktopApi['openProjectFile'],
  saveProjectFile: invoke(IPC_CHANNELS.saveProjectFile) as EvmDesktopApi['saveProjectFile'],
  saveReport: invoke(IPC_CHANNELS.saveReport) as EvmDesktopApi['saveReport'],
  getSettings: invoke(IPC_CHANNELS.getSettings) as EvmDesktopApi['getSettings'],
  saveSettings: invoke(IPC_CHANNELS.saveSettings) as EvmDesktopApi['saveSettings'],
  testAiConnection: invoke(IPC_CHANNELS.testAiConnection) as EvmDesktopApi['testAiConnection'],
  generateAiSummary: invoke(IPC_CHANNELS.generateAiSummary) as EvmDesktopApi['generateAiSummary'],
  getAppVersion: invoke(IPC_CHANNELS.getAppVersion) as EvmDesktopApi['getAppVersion'],
  onMenuCommand(listener) {
    // Only known commands reach the page; the event object is never passed on.
    const handler = (_event: IpcRendererEvent, command: unknown) => {
      if ((MENU_COMMANDS as readonly unknown[]).includes(command)) listener(command as MenuCommand);
    };
    ipcRenderer.on(IPC_CHANNELS.menuCommand, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.menuCommand, handler);
    };
  },
};

contextBridge.exposeInMainWorld('evmDesktop', Object.freeze(api));
