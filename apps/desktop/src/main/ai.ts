// FR-52: AI summaries in the main process with the key from safeStorage. Uses the same
// prompt, timeout and Zod validation as apps/ai-proxy (@evm/platform/ai). Never throws:
// the renderer falls back to the offline summary for every failure (FR-34, RL-05).

import type { SummaryRequest } from '@evm/core/ai';
import {
  checkGeminiModel,
  createGeminiGenerator,
  type GenerateSummary,
  generateSummary,
  SUMMARY_TIMEOUT_MS,
  type SummaryFailure,
} from '@evm/platform/ai';
import type { AiFailure, AiResult, ConnectionTestResult } from '@evm/platform/bridge';
import type { FileLogger } from './logger';

export interface AiDeps {
  getApiKey(): string | null;
  getModel(): string;
  isOnline(): boolean;
  log: FileLogger;
  timeoutMs?: number;
  /** Injected in tests. */
  createGenerator?: (config: { apiKey: string; model: string }) => GenerateSummary;
  checkModel?: (config: { apiKey: string; model: string }, signal: AbortSignal) => Promise<void>;
}

const FAILURE_REASON: Record<SummaryFailure, AiFailure> = {
  timeout: 'timeout',
  network: 'network',
  upstream: 'server',
  'invalid-output': 'invalid',
};

function credentials(deps: AiDeps): { apiKey: string; model: string } | null {
  const apiKey = deps.getApiKey();
  const model = deps.getModel();
  return apiKey && model ? { apiKey, model } : null;
}

/** `request` has already been validated by the IPC layer (GenerateAiSummarySchema). */
export async function generateDesktopSummary(
  request: SummaryRequest,
  deps: AiDeps,
): Promise<AiResult> {
  const config = credentials(deps);
  if (!config) return { ok: false, reason: 'not-configured' };
  if (!deps.isOnline()) return { ok: false, reason: 'network' };
  try {
    const outcome = await generateSummary(request, {
      generate: (deps.createGenerator ?? createGeminiGenerator)(config),
      log: deps.log,
      timeoutMs: deps.timeoutMs ?? SUMMARY_TIMEOUT_MS,
    });
    if (!outcome.ok) {
      deps.log.info(`AI summary failed: ${outcome.failure}`);
      return { ok: false, reason: FAILURE_REASON[outcome.failure] };
    }
    deps.log.info('AI summary generated');
    return { ok: true, summary: outcome.summary, model: config.model };
  } catch (error) {
    deps.log.error('AI summary failed unexpectedly', error);
    return { ok: false, reason: 'server' };
  }
}

/** "Test connection": checks the key and model name without generating anything. */
export async function testAiConnection(deps: AiDeps): Promise<ConnectionTestResult> {
  const config = credentials(deps);
  if (!config) {
    return { ok: false, message: 'Save a model name and an API key first.' };
  }
  if (!deps.isOnline()) {
    return {
      ok: false,
      message: 'No internet connection. AI summaries will use the offline version.',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? SUMMARY_TIMEOUT_MS);
  try {
    await (deps.checkModel ?? checkGeminiModel)(config, controller.signal);
    deps.log.info('AI connection test passed');
    return { ok: true, message: `Connected. Model “${config.model}” is available.` };
  } catch (error) {
    deps.log.error('AI connection test failed', error);
    const text = error instanceof Error ? error.message : '';
    const message = controller.signal.aborted
      ? 'The AI service did not answer in time.'
      : /API key|API_KEY|PERMISSION_DENIED|401|403/i.test(text)
        ? 'The API key was not accepted. Check it in Google AI Studio.'
        : /not found|404|NOT_FOUND/i.test(text)
          ? 'The model name was not found. Copy it exactly from Google AI Studio.'
          : 'Could not reach the AI service. Check your internet connection.';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}
