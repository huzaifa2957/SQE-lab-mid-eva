import { Download, RotateCcw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadText } from '../lib/files';
import type { ProjectStorage } from '../lib/storage';
import { Button } from './ui/Button';

interface Props {
  storage: ProjectStorage;
  children: ReactNode;
}

interface State {
  error: Error | null;
  exportFailed: boolean;
}

/** RL-03: a crash shows a friendly screen with Reload and Export data, never a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, exportFailed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // RL-06: log the technical detail for developers only; no project data is logged.
    console.error('Unexpected UI error', error.name, info.componentStack?.split('\n')[1]?.trim());
  }

  private exportData = async () => {
    try {
      const documents = await this.props.storage.loadAll();
      downloadText(
        JSON.stringify(documents, null, 2),
        'evm-cost-tracker-backup.json',
        'application/json',
      );
    } catch {
      this.setState({ exportFailed: true });
    }
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-text"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-error-soft text-error-strong">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-section font-medium">Something went wrong</h1>
          <p className="mt-2 text-body text-muted">
            The app hit an unexpected problem. Your projects are saved in this browser. Reload to
            carry on, or export a backup of your data first.
          </p>
          {this.state.exportFailed && (
            <p className="mt-3 text-control text-error-strong">The backup could not be created.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button variant="secondary" icon={Download} onClick={this.exportData}>
              Export data
            </Button>
          </div>
        </div>
      </main>
    );
  }
}
