// SR-06: the main-process side of window.evmDesktop. Every message is checked twice before
// anything happens: it must come from the app's own page, and its arguments must match the
// Zod schema exactly (nothing extra). Anything else is rejected with a generic error.

import path from 'node:path';
import type { SummaryRequest } from '@evm/core/ai';
import {
  type AiResult,
  type ConnectionTestResult,
  type DesktopSettings,
  GenerateAiSummarySchema,
  IPC_CHANNELS,
  MAX_PROJECT_FILE_BYTES,
  type OpenedProjectFile,
  type ReportKind,
  SaveProjectFileSchema,
  SaveReportSchema,
  type SaveResult,
  SaveSettingsSchema,
} from '@evm/platform/bridge';
import type { Dialog, IpcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { FileLogger } from './logger';

export class IpcRejected extends Error {
  override name = 'IpcRejected';
  constructor() {
    super('The request was not accepted.');
  }
}

export interface FileSystem {
  readFile(file: string, encoding: 'utf8'): Promise<string>;
  writeFile(file: string, data: string | Uint8Array): Promise<void>;
  stat(file: string): Promise<{ size: number }>;
}

export interface IpcDeps {
  dialog: Pick<Dialog, 'showOpenDialog' | 'showSaveDialog'>;
  fs: FileSystem;
  /** Folder the Save/Open dialogs start in (e.g. Documents). */
  defaultDir: string;
  isTrustedSender(url: string): boolean;
  settings: {
    get(): DesktopSettings;
    save(input: { model?: string; apiKey?: string | null }): DesktopSettings;
  };
  ai: {
    generate(request: SummaryRequest): Promise<AiResult>;
    test(): Promise<ConnectionTestResult>;
  };
  appVersion: string;
  log: FileLogger;
}

export const FILE_FILTERS: Record<'project' | ReportKind, { name: string; extensions: string[] }> =
  {
    project: { name: 'EVM project file', extensions: ['json'] },
    pdf: { name: 'PDF document', extensions: ['pdf'] },
    xlsx: { name: 'Excel workbook', extensions: ['xlsx'] },
    csv: { name: 'CSV file', extensions: ['csv'] },
  };

/** The full suffix each kind must end with (".evm.json" for projects, FR-43). */
const SUFFIX: Record<'project' | ReportKind, string> = {
  project: '.evm.json',
  pdf: '.pdf',
  xlsx: '.xlsx',
  csv: '.csv',
};

/** Adds the expected extension if the user typed a name without it. */
export function withExtension(file: string, kind: 'project' | ReportKind): string {
  const expected = FILE_FILTERS[kind].extensions[0]!;
  return file.toLowerCase().endsWith(`.${expected}`) ? file : `${file}${SUFFIX[kind]}`;
}

const NoArgs = z.tuple([]);

type Handler<A extends unknown[]> = (...args: A) => unknown;

export function registerIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  const handle = <S extends z.ZodTuple>(
    channel: string,
    schema: S,
    handler: Handler<z.infer<S>>,
  ) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const url = event.senderFrame?.url ?? '';
      if (!deps.isTrustedSender(url)) {
        deps.log.error(`IPC ${channel} rejected: untrusted sender`);
        throw new IpcRejected();
      }
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        deps.log.error(
          `IPC ${channel} rejected: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.') || '(args)'} ${i.message}`)
            .join('; ')}`,
        );
        throw new IpcRejected();
      }
      try {
        return await handler(...(parsed.data as z.infer<S>));
      } catch (error) {
        deps.log.error(`IPC ${channel} failed`, error);
        throw new IpcRejected();
      }
    });
  };

  const saveWithDialog = async (
    kind: 'project' | ReportKind,
    suggestedName: string,
    data: string | Uint8Array,
  ): Promise<SaveResult> => {
    const choice = await deps.dialog.showSaveDialog({
      title: kind === 'project' ? 'Save project file' : 'Save report',
      defaultPath: path.join(deps.defaultDir, suggestedName),
      filters: [FILE_FILTERS[kind]],
      properties: ['showOverwriteConfirmation'],
    });
    if (choice.canceled || !choice.filePath) return { saved: false };
    const target = withExtension(choice.filePath, kind);
    await deps.fs.writeFile(target, data);
    deps.log.info(`Saved a ${kind === 'project' ? 'project file' : `${kind} report`}`);
    return { saved: true, fileName: path.basename(target) };
  };

  // FR-51: native dialogs for project files and reports
  handle(IPC_CHANNELS.openProjectFile, NoArgs, async (): Promise<OpenedProjectFile | null> => {
    const choice = await deps.dialog.showOpenDialog({
      title: 'Open project file',
      defaultPath: deps.defaultDir,
      filters: [FILE_FILTERS.project],
      properties: ['openFile'],
    });
    const file = choice.filePaths[0];
    if (choice.canceled || !file) return null;
    const { size } = await deps.fs.stat(file);
    const name = path.basename(file);
    deps.log.info('Opened a project file');
    // Too large: let the renderer show its usual "larger than 5 MB" message (VR-02).
    if (size > MAX_PROJECT_FILE_BYTES) return { name, size, text: '' };
    return { name, size, text: await deps.fs.readFile(file, 'utf8') };
  });

  handle(IPC_CHANNELS.saveProjectFile, z.tuple([SaveProjectFileSchema]), (input) =>
    saveWithDialog('project', input.suggestedName, input.contents),
  );

  handle(IPC_CHANNELS.saveReport, z.tuple([SaveReportSchema]), (input) =>
    saveWithDialog(input.kind, input.suggestedName, input.data),
  );

  // FR-52: settings and AI
  handle(IPC_CHANNELS.getSettings, NoArgs, () => deps.settings.get());

  handle(IPC_CHANNELS.saveSettings, z.tuple([SaveSettingsSchema]), (input) => {
    const result = deps.settings.save(input);
    if (input.apiKey === null) deps.log.info('API key removed');
    else if (input.apiKey !== undefined) deps.log.info('API key saved (encrypted)');
    if (input.model !== undefined) deps.log.info('Model setting saved');
    return result;
  });

  handle(IPC_CHANNELS.testAiConnection, NoArgs, () => deps.ai.test());

  handle(IPC_CHANNELS.generateAiSummary, z.tuple([GenerateAiSummarySchema]), (request) =>
    deps.ai.generate(request),
  );

  handle(IPC_CHANNELS.getAppVersion, NoArgs, () => deps.appVersion);
}
