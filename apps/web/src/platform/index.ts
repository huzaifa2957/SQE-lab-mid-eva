// Platform layer (FR-50, FR-51): the few things that differ between the browser and the
// Electron desktop app — saving files, opening project files and calling the AI. Everything
// else (UI, core calculations, IndexedDB auto-save) is shared and unchanged.
//
// The desktop implementation is used only when the Electron preload has exposed
// `window.evmDesktop`; otherwise the browser behaviour is exactly as before.

import type { SummaryRequest } from '@evm/core';
import type {
  AiResult,
  EvmDesktopApi,
  OpenedProjectFile,
  ReportKind,
  SaveResult,
} from '@evm/platform/bridge';
import { browserPlatform } from './browser';
import { desktopPlatform } from './desktop';

declare global {
  interface Window {
    /** Set by the Electron preload script (apps/desktop) — never in a normal browser. */
    evmDesktop?: EvmDesktopApi;
  }
}

export type SaveKind = 'project' | ReportKind;

export interface SaveFileInput {
  kind: SaveKind;
  /** Suggested file name (FR-43); the desktop dialog lets the user change it. */
  name: string;
  data: string | Uint8Array;
  mimeType: string;
}

export interface Platform {
  kind: 'browser' | 'desktop';
  /** Browser: starts a download. Desktop: native Save dialog (`saved: false` if cancelled). */
  saveFile(input: SaveFileInput): Promise<SaveResult>;
  /** Native Open dialog for project files, or null where an <input type="file"> is used. */
  openProjectFile: (() => Promise<OpenedProjectFile | null>) | null;
  /** AI summary: browser → AI proxy; desktop → main process. Never throws. */
  generateAiSummary(request: SummaryRequest, signal?: AbortSignal): Promise<AiResult>;
  /** Desktop-only API (settings, version, menu), or null in the browser. */
  desktop: EvmDesktopApi | null;
}

/** Looked up on each call, so the result follows what the preload exposed. */
export function getPlatform(): Platform {
  const bridge = typeof window === 'undefined' ? undefined : window.evmDesktop;
  return bridge ? desktopPlatform(bridge) : browserPlatform;
}

export type { AiResult, OpenedProjectFile, SaveResult } from '@evm/platform/bridge';
