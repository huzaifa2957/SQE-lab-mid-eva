// SR-06: a small application menu. Developer tools and reload only exist in development.

import type { MenuCommand } from '@evm/platform/channels';
import type { MenuItemConstructorOptions } from 'electron';

export interface MenuActions {
  isDev: boolean;
  send(command: MenuCommand): void;
  showAbout(): void;
  openLogFolder(): void;
}

export function buildMenuTemplate(actions: MenuActions): MenuItemConstructorOptions[] {
  const command = (label: string, accelerator: string, name: MenuCommand) => ({
    label,
    accelerator,
    click: () => actions.send(name),
  });
  return [
    {
      label: '&File',
      submenu: [
        command('&Open project…', 'CmdOrCtrl+O', 'open-project'),
        command('&Save project…', 'CmdOrCtrl+S', 'save-project'),
        command('&Export report…', 'CmdOrCtrl+E', 'export-report'),
        { type: 'separator' },
        { label: '&Quit', role: 'quit' },
      ],
    },
    {
      label: '&View',
      submenu: [
        command('Toggle &theme', 'CmdOrCtrl+Shift+L', 'toggle-theme'),
        ...(actions.isDev
          ? ([
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: '&About EVM Cost Tracker', click: actions.showAbout },
        { label: 'Open &log folder', click: actions.openLogFolder },
      ],
    },
  ];
}
