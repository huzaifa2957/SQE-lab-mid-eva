// IPC channel names and menu commands (no dependencies, so the sandboxed preload stays tiny).

export const IPC_CHANNELS = Object.freeze({
  openProjectFile: 'evm:open-project-file',
  saveProjectFile: 'evm:save-project-file',
  saveReport: 'evm:save-report',
  getSettings: 'evm:get-settings',
  saveSettings: 'evm:save-settings',
  testAiConnection: 'evm:test-ai-connection',
  generateAiSummary: 'evm:generate-ai-summary',
  getAppVersion: 'evm:get-app-version',
  /** main → renderer: a menu item was chosen */
  menuCommand: 'evm:menu-command',
});

export const MENU_COMMANDS = [
  'open-project',
  'save-project',
  'export-report',
  'toggle-theme',
] as const;
export type MenuCommand = (typeof MENU_COMMANDS)[number];
