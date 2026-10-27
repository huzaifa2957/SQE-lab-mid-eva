import type { ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import type { ProjectStorage } from './lib/storage';
import { DataPage } from './pages/data/DataPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { type PageId, useHashPage } from './state/navigation';
import { ProjectStoreProvider } from './state/ProjectStore';
import { ThemeProvider } from './state/ThemeProvider';
import { ToastProvider } from './state/ToastProvider';

export function Providers({ storage, children }: { storage: ProjectStorage; children: ReactNode }) {
  return (
    <ErrorBoundary storage={storage}>
      <ThemeProvider>
        <ToastProvider>
          <ProjectStoreProvider storage={storage}>{children}</ProjectStoreProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function CurrentPage({ page, navigate }: { page: PageId; navigate: (page: PageId) => void }) {
  switch (page) {
    case 'projects':
      return <ProjectsPage onNavigate={navigate} />;
    case 'data':
      return <DataPage onNavigate={navigate} />;
    case 'dashboard':
      return (
        <PlaceholderPage
          title="Dashboard"
          phase={4}
          description="KPI cards, the S-curve, cost comparison and CPI/SPI trend charts."
        />
      );
    case 'insights':
      return (
        <PlaceholderPage
          title="Insights"
          phase={5}
          description="Indicator-based insights, anomaly detection and an AI summary."
        />
      );
    case 'report':
      return <PlaceholderPage title="Report" phase={6} description="PDF, Excel and CSV reports." />;
    case 'settings':
      return <SettingsPage />;
  }
}

export default function App({ storage }: { storage: ProjectStorage }) {
  const [page, navigate] = useHashPage();
  return (
    <Providers storage={storage}>
      <AppShell page={page} onNavigate={navigate}>
        <CurrentPage page={page} navigate={navigate} />
      </AppShell>
    </Providers>
  );
}
