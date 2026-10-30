// Browser platform: downloads, the AI proxy and <input type="file"> (unchanged web behaviour).

import { aiProxyUrl, requestAiSummary } from '../lib/aiClient';
import { downloadBlob } from '../lib/files';
import type { Platform } from './index';

export const browserPlatform: Platform = {
  kind: 'browser',
  async saveFile({ name, data, mimeType }) {
    downloadBlob(new Blob([data], { type: mimeType }), name);
    return { saved: true, fileName: name };
  },
  openProjectFile: null,
  async generateAiSummary(request, signal) {
    const url = aiProxyUrl();
    return url
      ? requestAiSummary(url, request, { signal })
      : { ok: false, reason: 'not-configured' };
  },
  desktop: null,
};
