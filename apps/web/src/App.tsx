import type { ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import type { ProjectStorage } from './lib/storage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { DataPage } from './pages/data/DataPage';
import { InsightsPage } from './pages/insights/InsightsPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ReportPage } from './pages/report/ReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChartImagesProvider } from './state/ChartImagesProvider';
import { type Navigate, type PageId, type PageParams, useHashRoute } from './state/navigation';
import { ProjectStoreProvider } from './state/ProjectStore';
import { ThemeProvider } from './state/ThemeProvider';
import { ToastProvider } from './state/ToastProvider';

export function Providers({ storage, children }: { storage: ProjectStorage; children: ReactNode }) {
  return (
    <ErrorBoundary storage={storage}>
      <ThemeProvider>
        <ToastProvider>
          <ProjectStoreProvider storage={storage}>
            <ChartImagesProvider>{children}</ChartImagesProvider>
          </ProjectStoreProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function CurrentPage({
  page,
  navigate,
  params,
}: {
  page: PageId;
  navigate: Navigate;
  params: PageParams;
}) {
  switch (page) {
    case 'projects':
      return <ProjectsPage onNavigate={navigate} params={params} />;
    case 'data':
      return <DataPage onNavigate={navigate} params={params} />;
    case 'dashboard':
      return <DashboardPage onNavigate={navigate} params={params} />;
    case 'insights':
      return <InsightsPage onNavigate={navigate} />;
    case 'report':
      return <ReportPage onNavigate={navigate} />;
    case 'settings':
      return <SettingsPage />;
  }
}

export default function App({ storage }: { storage: ProjectStorage }) {
  const [page, navigate, params] = useHashRoute();
  return (
    <Providers storage={storage}>
      <AppShell page={page} onNavigate={navigate}>
        <CurrentPage page={page} navigate={navigate} params={params} />
      </AppShell>
    </Providers>
  );
}
