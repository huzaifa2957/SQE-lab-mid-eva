import {
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  Moon,
  Settings,
  Sprout,
  Sun,
  Table2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { PageId } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { useTheme } from '../../state/ThemeProvider';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';

const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'data', label: 'Data', icon: Table2 },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'report', label: 'Report', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface AppShellProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-feature text-accent">
            <Sprout size={18} aria-hidden="true" />
          </span>
          <span className="font-display text-subsection font-medium">EVM Cost Tracker</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 p-3">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = id === page;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(id)}
                className={cx(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-left text-control font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-text'
                    : 'text-muted hover:bg-card-subtle hover:text-text',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>
        <p className="mt-auto px-5 py-4 font-mono text-support text-muted">
          Data stays in this browser
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function TopBar() {
  const { current } = useProjects();
  const { theme, toggle } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-8">
      <div className="flex min-w-0 items-center gap-4">
        <p
          className="truncate font-display text-subsection font-medium"
          data-testid="current-project"
        >
          {current ? current.project.name : 'No project selected'}
        </p>
        {current && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-support text-muted">
            <CalendarDays size={13} aria-hidden="true" />
            Status date {current.project.statusDate}
          </span>
        )}
      </div>
      <Button variant="ghost" icon={theme === 'dark' ? Sun : Moon} iconOnly onClick={toggle}>
        {`Switch to ${nextTheme} mode`}
      </Button>
    </header>
  );
}
