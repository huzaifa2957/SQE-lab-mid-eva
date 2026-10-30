import type { MenuCommand } from '@evm/platform/bridge';
import { useEffect, useRef } from 'react';
import { getPlatform } from '../platform';
import type { Navigate } from '../state/navigation';
import { useProjects } from '../state/ProjectStore';
import { useTheme } from '../state/ThemeProvider';
import { useToast } from '../state/ToastProvider';
import { useProjectFiles } from '../state/useProjectFiles';

/**
 * Desktop only: turns native menu items (File / View) into app actions. Renders nothing,
 * and does nothing in the browser.
 */
export function DesktopMenuBridge({ onNavigate }: { onNavigate: Navigate }) {
  const { current } = useProjects();
  const { toggle } = useTheme();
  const toast = useToast();
  const files = useProjectFiles();
  const latest = useRef({ current, toggle, toast, files, onNavigate });
  latest.current = { current, toggle, toast, files, onNavigate };

  useEffect(() => {
    const desktop = getPlatform().desktop;
    if (!desktop) return;
    let opens = 0;
    return desktop.onMenuCommand((command: MenuCommand) => {
      const app = latest.current;
      switch (command) {
        case 'open-project':
          app.onNavigate('projects', { open: String(++opens) });
          break;
        case 'save-project':
          if (app.current) void app.files.saveFile(app.current);
          else app.toast({ tone: 'info', title: 'Open or create a project first' });
          break;
        case 'export-report':
          app.onNavigate('report');
          break;
        case 'toggle-theme':
          app.toggle();
          break;
      }
    });
  }, []);

  return null;
}
