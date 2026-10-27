import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';
import * as files from '../lib/files';
import { MemoryProjectStorage } from '../lib/storage';
import { makeDocument } from './render';

function Boom(): never {
  throw new Error('kaboom');
}

describe('error boundary (RL-03)', () => {
  it('CT-ERR-01 shows a friendly fallback with Reload and Export data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The thrown error is expected; stop jsdom from printing it as an uncaught exception.
    const silence = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', silence);
    onTestFinished(() => window.removeEventListener('error', silence));
    const download = vi.spyOn(files, 'downloadText').mockImplementation(() => {});
    render(
      <ErrorBoundary storage={new MemoryProjectStorage([makeDocument()])}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByText('kaboom')).not.toBeInTheDocument(); // no technical detail shown

    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [text, name] = download.mock.calls[0]!;
    expect(name).toBe('evm-cost-tracker-backup.json');
    expect(JSON.parse(text)).toHaveLength(1);
  });
});
