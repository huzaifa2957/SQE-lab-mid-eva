// The desktop bridge contract (SR-06, FR-50…FR-52): the only API the Electron preload
// exposes to the web app as `window.evmDesktop`, its IPC channel names, and the Zod schemas
// the main process uses to validate every message. Types only for the web app.

import { type AiSummary, type SummaryRequest, SummaryRequestSchema } from '@evm/core/ai';
import { z } from 'zod';

export { IPC_CHANNELS, MENU_COMMANDS, type MenuCommand } from './channels';
import type { MenuCommand } from './channels';

/** Same limit as project files in the browser (VR-02). */
export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_REPORT_BYTES = 50 * 1024 * 1024;

/** A bare file name (no folders) without characters Windows forbids. */
const FileNameSchema = z
  .string()
  .min(1)
  .max(120)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^<>:"/\\|?*\u0000-\u001f]+$/, 'must be a file name without a folder')
  .refine((name) => !/^\.+$/.test(name), 'must be a file name');

export const SaveProjectFileSchema = z
  .object({
    suggestedName: FileNameSchema,
    contents: z.string().min(1).max(MAX_PROJECT_FILE_BYTES),
  })
  .strict();

export const REPORT_KINDS = ['pdf', 'xlsx', 'csv'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const SaveReportSchema = z
  .object({
    kind: z.enum(REPORT_KINDS),
    suggestedName: FileNameSchema,
    data: z
      .instanceof(Uint8Array)
      .refine((d) => d.byteLength > 0 && d.byteLength <= MAX_REPORT_BYTES, 'size out of range'),
  })
  .strict();

/** Model names as shown in Google AI Studio, e.g. letters, digits, ".", "-", "/". */
export const ModelNameSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.\-/]*$/, 'must be a model name such as the one shown in Google AI Studio');

export const ApiKeySchema = z
  .string()
  .trim()
  .min(10, 'looks too short to be an API key')
  .max(200)
  .regex(/^[\x21-\x7e]+$/, 'must not contain spaces or special characters');

/** `apiKey: null` removes the stored key; leaving it out keeps it. */
export const SaveSettingsSchema = z
  .object({ model: ModelNameSchema.optional(), apiKey: ApiKeySchema.nullable().optional() })
  .strict();

export const GenerateAiSummarySchema = SummaryRequestSchema;

export interface OpenedProjectFile {
  name: string;
  size: number;
  text: string;
}

/** `saved: false` means the user cancelled the dialog. The full path is not returned. */
export interface SaveResult {
  saved: boolean;
  fileName?: string;
}

/** What the renderer may know about the settings: never the API key itself. */
export interface DesktopSettings {
  model: string;
  hasApiKey: boolean;
  /** Last four characters of the saved key, e.g. "1234". */
  apiKeyHint: string | null;
  /** False when the OS cannot encrypt secrets (the key can then not be saved). */
  encryptionAvailable: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export type AiFailure =
  'not-configured' | 'timeout' | 'rate-limited' | 'server' | 'network' | 'invalid' | 'cancelled';

export type AiResult =
  { ok: true; summary: AiSummary; model?: string } | { ok: false; reason: AiFailure };

export interface EvmDesktopApi {
  openProjectFile(): Promise<OpenedProjectFile | null>;
  saveProjectFile(input: z.input<typeof SaveProjectFileSchema>): Promise<SaveResult>;
  saveReport(input: z.input<typeof SaveReportSchema>): Promise<SaveResult>;
  getSettings(): Promise<DesktopSettings>;
  saveSettings(input: z.input<typeof SaveSettingsSchema>): Promise<DesktopSettings>;
  testAiConnection(): Promise<ConnectionTestResult>;
  generateAiSummary(request: SummaryRequest): Promise<AiResult>;
  getAppVersion(): Promise<string>;
  /** Subscribes to menu commands; returns an unsubscribe function. */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}
