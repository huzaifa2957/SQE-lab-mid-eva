// Platform adapter (FR-50…FR-52): the browser behaviour is unchanged; with a (fake)
// window.evmDesktop bridge the same UI uses native dialogs, desktop settings and main-process AI.

import { serializeProjectFile } from '@evm/core';
import type {
  DesktopSettings,
  EvmDesktopApi,
  MenuCommand,
  OpenedProjectFile,
} from '@evm/platform/bridge';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as files from '../lib/files';
import { buildSampleDocument } from '../lib/sampleProject';
import { getPlatform } from '../platform';
import { makeDocument, renderApp } from './render';

const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

function fakeBridge(overrides: Partial<EvmDesktopApi> = {}) {
  let settings: DesktopSettings = {
    model: '',
    hasApiKey: false,
    apiKeyHint: null,
    encryptionAvailable: true,
  };
  const listeners = new Set<(command: MenuCommand) => void>();
  const mocks = {
    openProjectFile: vi.fn(async (): Promise<OpenedProjectFile | null> => null),
    saveProjectFile: vi.fn(async (input: { suggestedName: string }) => ({
      saved: true,
      fileName: input.suggestedName,
    })),
    saveReport: vi.fn(async (input: { suggestedName: string }) => ({
      saved: true,
      fileName: input.suggestedName,
    })),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (input: { model?: string; apiKey?: string | null }) => {
      settings = {
        ...settings,
        ...(input.model !== undefined && { model: input.model }),
        ...(input.apiKey === null && { hasApiKey: false, apiKeyHint: null }),
        ...(typeof input.apiKey === 'string' && {
          hasApiKey: true,
          apiKeyHint: input.apiKey.slice(-4),
        }),
      };
      return settings;
    }),
    testAiConnection: vi.fn(async () => ({
      ok: true,
      message: 'Connected. Model “m” is available.',
    })),
    generateAiSummary: vi.fn(async () => ({
      ok: false as const,
      reason: 'not-configured' as const,
    })),
    getAppVersion: vi.fn(async () => '0.7.0'),
    onMenuCommand: vi.fn((listener: (command: MenuCommand) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  // Overrides replace individual mocks; keep the mock types for the assertions.
  const bridge = { ...mocks, ...overrides } as typeof mocks;
  const send = (command: MenuCommand) => act(() => listeners.forEach((l) => l(command)));
  window.evmDesktop = bridge as unknown as EvmDesktopApi;
  return { bridge, send };
}

afterEach(() => {
  delete window.evmDesktop;
});

describe('browser platform (unchanged web behaviour)', () => {
  it('CT-PLAT-01 no bridge → browser downloads, file input, proxy AI, no desktop settings', async () => {
    expect(getPlatform().kind).toBe('browser');
    expect(getPlatform().openProjectFile).toBeNull();
    expect(getPlatform().desktop).toBeNull();
    const download = vi.spyOn(files, 'downloadBlob');
    await getPlatform().saveFile({ kind: 'csv', name: 'a.csv', data: 'x', mimeType: 'text/csv' });
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'a.csv');

    await renderApp({ page: 'settings' });
    expect(
      screen.queryByRole('heading', { name: 'Desktop: Gemini API key' }),
    ).not.toBeInTheDocument();
  });
});

describe('desktop platform (window.evmDesktop)', () => {
  it('CT-PLAT-02 project files and reports go through native dialogs, not downloads', async () => {
    const { bridge } = fakeBridge();
    const download = vi.spyOn(files, 'downloadBlob');
    expect(getPlatform().kind).toBe('desktop');

    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(bridge.saveReport).toHaveBeenCalled());
    const input = bridge.saveReport.mock.calls[0]![0] as {
      kind: string;
      suggestedName: string;
      data: Uint8Array;
    };
    expect(input.kind).toBe('csv');
    expect(input.suggestedName).toBe('EVM_Clinic_Building_Extension_2026-04-03.csv');
    expect([...input.data.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM kept as bytes
    expect(await screen.findByText('CSV report saved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await user.click(screen.getAllByRole('button', { name: 'Save file' })[0]!);
    await waitFor(() => expect(bridge.saveProjectFile).toHaveBeenCalled());
    const project = bridge.saveProjectFile.mock.calls[0]![0] as {
      suggestedName: string;
      contents: string;
    };
    expect(project.suggestedName).toBe('Clinic_Building_Extension.evm.json');
    expect(JSON.parse(project.contents).format).toBe('evm-cost-tracker');
    expect(download).not.toHaveBeenCalled();
  });

  it('CT-PLAT-03 a cancelled Save dialog shows no success message', async () => {
    fakeBridge({ saveReport: vi.fn(async () => ({ saved: false })) });
    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled());
    expect(screen.queryByText(/report saved/)).not.toBeInTheDocument();
  });

  it('CT-PLAT-04 "Open project file" uses the native dialog and validates the file', async () => {
    const other = makeDocument({}, 'p2');
    other.project.name = 'Clinic Extension';
    const text = serializeProjectFile(other);
    const { bridge } = fakeBridge({
      openProjectFile: vi.fn(async () => ({ name: 'clinic.evm.json', size: text.length, text })),
    });
    const { user } = await renderApp({ page: 'projects' });
    await user.click(screen.getByRole('button', { name: 'Open project file' }));
    expect(bridge.openProjectFile).toHaveBeenCalled();
    expect(await screen.findByText('Opened “Clinic Extension”')).toBeInTheDocument();

    bridge.openProjectFile.mockResolvedValueOnce({ name: 'bad.evm.json', size: 5, text: '{ bad' });
    await user.click(screen.getByRole('button', { name: 'Open project file' }));
    expect((await screen.findAllByText(/not valid JSON/)).length).toBeGreaterThan(0);
  });

  it('CT-PLAT-05 Settings: save, test and remove the key; only the last 4 characters are shown', async () => {
    const { bridge } = fakeBridge();
    const { user } = await renderApp({ page: 'settings' });
    const card = within(
      (await screen.findByRole('heading', { name: 'Desktop: Gemini API key' })).closest('section')!,
    );
    expect(await card.findByText('No key saved')).toBeInTheDocument();
    expect(card.getByText('Desktop app 0.7.0')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Test connection' })).toBeDisabled();

    await user.type(card.getByLabelText('Gemini model'), 'gemini-flash-test');
    const keyInput = card.getByLabelText('API key');
    expect(keyInput).toHaveAttribute('type', 'password');
    await user.type(keyInput, 'short');
    await user.click(card.getByRole('button', { name: 'Save key' }));
    expect(await card.findByText(/looks too short/)).toBeInTheDocument();
    expect(bridge.saveSettings).not.toHaveBeenCalled();

    await user.clear(keyInput);
    await user.type(keyInput, 'AIzaSyTEST-full-key-1234');
    await user.click(card.getByRole('button', { name: 'Save key' }));
    expect(await card.findByText('Key saved ••••1234')).toBeInTheDocument();
    expect(bridge.saveSettings).toHaveBeenCalledWith({
      model: 'gemini-flash-test',
      apiKey: 'AIzaSyTEST-full-key-1234',
    });
    expect(keyInput).toHaveValue('');
    expect(document.body.textContent).not.toContain('AIzaSyTEST-full-key-1234');

    await user.click(card.getByRole('button', { name: 'Test connection' }));
    const result = await card.findByRole('status', { name: 'Connection test result' });
    expect(result).toHaveTextContent(/Connected/);

    await user.click(card.getByRole('button', { name: 'Remove key' }));
    expect(await card.findByText('No key saved')).toBeInTheDocument();
    expect(bridge.saveSettings).toHaveBeenLastCalledWith({ apiKey: null });
  });

  it('CT-PLAT-06 AI summary runs in the main process; no key → offline fallback, no proxy call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { bridge } = fakeBridge();
    const { user } = await renderApp({ documents: [sample()], page: 'insights' });
    await user.click(screen.getByRole('button', { name: 'Generate AI summary' }));
    expect(await screen.findByText('Generated offline (rule-based)')).toBeInTheDocument();
    expect(screen.getByText('AI service not configured')).toBeInTheDocument();
    expect(bridge.generateAiSummary).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Clinic Building Extension' }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    bridge.generateAiSummary.mockResolvedValueOnce({
      ok: true,
      summary: {
        executiveSummary: 'From the desktop.',
        keyRisks: ['a', 'b'],
        recommendations: ['1', '2', '3'],
      },
      model: 'm',
    } as never);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('AI-generated — verify before use')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('CT-PLAT-07 menu commands: open, save, export report and toggle theme', async () => {
    const { bridge, send } = fakeBridge();
    await renderApp({ documents: [sample()], page: 'dashboard' });

    send('toggle-theme');
    expect(document.documentElement.dataset.theme).toBe('dark');
    send('export-report');
    expect(await screen.findByRole('heading', { name: 'Report', level: 1 })).toBeInTheDocument();
    send('save-project');
    await waitFor(() => expect(bridge.saveProjectFile).toHaveBeenCalledTimes(1));
    send('open-project');
    await waitFor(() => expect(bridge.openProjectFile).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toMatch(/^#\/projects\?open=1$/);
    send('open-project');
    await waitFor(() => expect(bridge.openProjectFile).toHaveBeenCalledTimes(2));
  });
});
