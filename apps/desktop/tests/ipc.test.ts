// SR-06 / FR-51: every IPC message is validated with Zod in the main process; native
// dialogs use the right filters and FR-43 default names.

import { IPC_CHANNELS, MAX_PROJECT_FILE_BYTES } from '@evm/platform/bridge';
import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILE_FILTERS,
  type IpcDeps,
  IpcRejected,
  registerIpcHandlers,
  withExtension,
} from '../src/main/ipc';
import { memoryLogger, validRequest } from './fixtures';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const APP_URL = 'app://evm/index.html';

function setup(overrides: Partial<IpcDeps> = {}) {
  const handlers = new Map<string, Listener>();
  const ipcMain = { handle: vi.fn((channel: string, fn: Listener) => handlers.set(channel, fn)) };
  const log = memoryLogger();
  const deps: IpcDeps = {
    dialog: {
      showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['C:\\Docs\\Clinic.evm.json'],
      })),
      showSaveDialog: vi.fn(async (options: { defaultPath?: string }) => ({
        canceled: false,
        filePath: options.defaultPath,
      })),
    } as unknown as IpcDeps['dialog'],
    fs: {
      readFile: vi.fn(async () => '{"format":"evm-cost-tracker"}'),
      writeFile: vi.fn(async () => {}),
      stat: vi.fn(async () => ({ size: 30 })),
    },
    defaultDir: 'C:\\Docs',
    isTrustedSender: (url) => url.startsWith('app://evm/'),
    settings: {
      get: vi.fn(() => ({
        model: 'm',
        hasApiKey: false,
        apiKeyHint: null,
        encryptionAvailable: true,
      })),
      save: vi.fn(() => ({
        model: 'm',
        hasApiKey: true,
        apiKeyHint: '1234',
        encryptionAvailable: true,
      })),
    },
    ai: {
      generate: vi.fn(async () => ({ ok: false as const, reason: 'not-configured' as const })),
      test: vi.fn(async () => ({ ok: true, message: 'Connected' })),
    },
    appVersion: '0.7.0',
    log,
    ...overrides,
  };
  registerIpcHandlers(ipcMain, deps);
  const call = (channel: string, args: unknown[] = [], url = APP_URL) =>
    Promise.resolve().then(() =>
      handlers.get(channel)!({ senderFrame: { url } } as unknown as IpcMainInvokeEvent, ...args),
    );
  return { deps, call, handlers, log };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('IPC registration', () => {
  it('UT-IPC-01 registers exactly the bridge channels', () => {
    const channels = [...ctx.handlers.keys()].sort();
    expect(channels).toEqual(
      Object.values(IPC_CHANNELS)
        .filter((c) => c !== IPC_CHANNELS.menuCommand)
        .sort(),
    );
  });
});

describe('IPC validation (SR-06)', () => {
  it('UT-IPC-02-P valid messages are handled', async () => {
    expect(await ctx.call(IPC_CHANNELS.getAppVersion)).toBe('0.7.0');
    expect(await ctx.call(IPC_CHANNELS.getSettings)).toMatchObject({ model: 'm' });
    await ctx.call(IPC_CHANNELS.generateAiSummary, [validRequest]);
    expect(ctx.deps.ai.generate).toHaveBeenCalledWith(validRequest);
    await ctx.call(IPC_CHANNELS.saveSettings, [{ model: 'gemini-x', apiKey: 'AIzaSyTESTKEY1234' }]);
    expect(ctx.deps.settings.save).toHaveBeenCalledWith({
      model: 'gemini-x',
      apiKey: 'AIzaSyTESTKEY1234',
    });
    expect(ctx.log.lines.join('\n')).not.toContain('AIzaSyTESTKEY1234');
  });

  it('UT-IPC-02-F rejects untrusted senders, extra arguments, extra fields and wrong types', async () => {
    const rejected = async (channel: string, args: unknown[], url = APP_URL) =>
      expect(ctx.call(channel, args, url)).rejects.toBeInstanceOf(IpcRejected);

    await rejected(IPC_CHANNELS.getAppVersion, [], 'https://evil.example/');
    await rejected(IPC_CHANNELS.getAppVersion, [], 'file:///C:/evil.html');
    await rejected(IPC_CHANNELS.getAppVersion, ['extra']);
    await rejected(IPC_CHANNELS.getSettings, [{}]);
    await rejected(IPC_CHANNELS.saveSettings, [{ apiKey: 'AIzaSyTESTKEY1234', path: 'x' }]);
    await rejected(IPC_CHANNELS.saveSettings, [{ apiKey: 'short' }]);
    await rejected(IPC_CHANNELS.saveSettings, [{ apiKey: 'has spaces in the key 123' }]);
    await rejected(IPC_CHANNELS.saveSettings, [{ model: 'bad model; rm -rf' }]);
    await rejected(IPC_CHANNELS.generateAiSummary, [{ ...validRequest, tasks: [] }]);
    await rejected(IPC_CHANNELS.generateAiSummary, [null]);
    await rejected(IPC_CHANNELS.saveProjectFile, [
      { suggestedName: '..\\..\\evil.evm.json', contents: '{}' },
    ]);
    await rejected(IPC_CHANNELS.saveProjectFile, [
      { suggestedName: 'C:/x.evm.json', contents: '{}' },
    ]);
    await rejected(IPC_CHANNELS.saveProjectFile, [{ suggestedName: 'a.evm.json', contents: '' }]);
    await rejected(IPC_CHANNELS.saveProjectFile, [
      { suggestedName: 'a.evm.json', contents: 'x'.repeat(MAX_PROJECT_FILE_BYTES + 1) },
    ]);
    await rejected(IPC_CHANNELS.saveReport, [
      { kind: 'exe', suggestedName: 'r.exe', data: new Uint8Array([1]) },
    ]);
    await rejected(IPC_CHANNELS.saveReport, [
      { kind: 'pdf', suggestedName: 'r.pdf', data: 'text' },
    ]);
    await rejected(IPC_CHANNELS.saveReport, [
      { kind: 'pdf', suggestedName: 'r.pdf', data: new Uint8Array(0) },
    ]);

    expect(ctx.deps.settings.save).not.toHaveBeenCalled();
    expect(ctx.deps.ai.generate).not.toHaveBeenCalled();
    expect(ctx.deps.fs.writeFile).not.toHaveBeenCalled();
    expect(ctx.log.lines.filter((l) => l.startsWith('ERROR IPC'))).toHaveLength(17);
  });

  it('UT-IPC-03 a failing handler is reported generically and logged', async () => {
    const failing = setup({
      ai: {
        generate: vi.fn(async () => {
          throw new Error('boom: internal details');
        }),
        test: vi.fn(),
      },
    });
    const error = (await failing
      .call(IPC_CHANNELS.generateAiSummary, [validRequest])
      .catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(IpcRejected);
    expect(String(error.message)).not.toContain('internal details');
    expect(failing.log.lines.join('\n')).toContain('boom: internal details');
  });
});

describe('native dialogs (FR-51)', () => {
  it('UT-DLG-01 saves a project with the FR-43 name, the project filter and the .evm.json suffix', async () => {
    const result = await ctx.call(IPC_CHANNELS.saveProjectFile, [
      { suggestedName: 'Clinic_Extension.evm.json', contents: '{"a":1}' },
    ]);
    const options = vi.mocked(ctx.deps.dialog.showSaveDialog).mock.calls[0]![0] as {
      defaultPath: string;
      filters: unknown[];
    };
    expect(options.defaultPath).toMatch(/Clinic_Extension\.evm\.json$/);
    expect(options.filters).toEqual([FILE_FILTERS.project]);
    expect(result).toEqual({ saved: true, fileName: 'Clinic_Extension.evm.json' });
    expect(ctx.deps.fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/Clinic_Extension\.evm\.json$/),
      '{"a":1}',
    );
  });

  it('UT-DLG-02 saves reports as bytes with the right filter per kind', async () => {
    for (const [kind, name] of [
      ['pdf', 'EVM_Clinic_2026-04-03.pdf'],
      ['xlsx', 'EVM_Clinic_2026-04-03.xlsx'],
      ['csv', 'EVM_Clinic_2026-04-03.csv'],
    ] as const) {
      const data = new Uint8Array([1, 2, 3]);
      const result = await ctx.call(IPC_CHANNELS.saveReport, [{ kind, suggestedName: name, data }]);
      expect(result).toEqual({ saved: true, fileName: name });
      const options = vi.mocked(ctx.deps.dialog.showSaveDialog).mock.calls.at(-1)![0] as {
        filters: unknown[];
      };
      expect(options.filters).toEqual([FILE_FILTERS[kind]]);
      expect(vi.mocked(ctx.deps.fs.writeFile).mock.calls.at(-1)![1]).toEqual(data);
    }
  });

  it('UT-DLG-03 cancelling a dialog saves or opens nothing', async () => {
    const cancelled = setup({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: '' })),
      } as unknown as IpcDeps['dialog'],
    });
    expect(await cancelled.call(IPC_CHANNELS.openProjectFile)).toBeNull();
    expect(
      await cancelled.call(IPC_CHANNELS.saveReport, [
        { kind: 'pdf', suggestedName: 'r.pdf', data: new Uint8Array([1]) },
      ]),
    ).toEqual({ saved: false });
    expect(cancelled.deps.fs.writeFile).not.toHaveBeenCalled();
  });

  it('UT-DLG-04 opens a project file; oversize files are not read', async () => {
    expect(await ctx.call(IPC_CHANNELS.openProjectFile)).toEqual({
      name: 'Clinic.evm.json',
      size: 30,
      text: '{"format":"evm-cost-tracker"}',
    });
    const options = vi.mocked(ctx.deps.dialog.showOpenDialog).mock.calls[0]![0] as {
      filters: unknown[];
    };
    expect(options.filters).toEqual([FILE_FILTERS.project]);

    const big = setup({
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        stat: vi.fn(async () => ({ size: MAX_PROJECT_FILE_BYTES + 1 })),
      },
    });
    expect(await big.call(IPC_CHANNELS.openProjectFile)).toMatchObject({ text: '' });
    expect(big.deps.fs.readFile).not.toHaveBeenCalled();
  });

  it('UT-DLG-05 adds the extension when the user leaves it off', () => {
    expect(withExtension('C:\\Docs\\report', 'pdf')).toBe('C:\\Docs\\report.pdf');
    expect(withExtension('C:\\Docs\\report.PDF', 'pdf')).toBe('C:\\Docs\\report.PDF');
    expect(withExtension('C:\\Docs\\clinic', 'project')).toBe('C:\\Docs\\clinic.evm.json');
    expect(withExtension('C:\\Docs\\clinic.json', 'project')).toBe('C:\\Docs\\clinic.json');
  });
});
