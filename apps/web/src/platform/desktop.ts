// Desktop platform: everything goes through the narrow `window.evmDesktop` bridge (SR-06).

import type { AiResult, EvmDesktopApi } from '@evm/platform/bridge';
import type { Platform } from './index';

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

/** Resolves with "cancelled" as soon as the signal aborts (the main process call keeps running). */
function cancellable(promise: Promise<AiResult>, signal?: AbortSignal): Promise<AiResult> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve({ ok: false, reason: 'cancelled' });
  return new Promise((resolve) => {
    const onAbort = () => resolve({ ok: false, reason: 'cancelled' });
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then(resolve, () => resolve({ ok: false, reason: 'server' }))
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function desktopPlatform(bridge: EvmDesktopApi): Platform {
  return {
    kind: 'desktop',
    saveFile({ kind, name, data }) {
      if (kind === 'project') {
        const contents = typeof data === 'string' ? data : new TextDecoder().decode(data);
        return bridge.saveProjectFile({ suggestedName: name, contents });
      }
      return bridge.saveReport({ kind, suggestedName: name, data: toBytes(data) });
    },
    openProjectFile: () => bridge.openProjectFile(),
    generateAiSummary(request, signal) {
      return cancellable(
        bridge.generateAiSummary(request).catch((): AiResult => ({ ok: false, reason: 'server' })),
        signal,
      );
    },
    desktop: bridge,
  };
}
