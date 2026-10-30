// Gemini call through the official @google/genai SDK (shared by the AI proxy and desktop).

import type { SummaryRequest } from '@evm/core/ai';
import { GoogleGenAI } from '@google/genai';
import type { GenerateSummary } from './summary';
import { buildUserPrompt, RESPONSE_JSON_SCHEMA, SYSTEM_INSTRUCTION } from './prompts';

export function createGeminiGenerator(config: { apiKey: string; model: string }): GenerateSummary {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  return async (request: SummaryRequest, signal: AbortSignal) => {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: buildUserPrompt(request),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0.2,
        abortSignal: signal,
      },
    });
    return response.text;
  };
}

/**
 * "Test connection" (FR-52): looks the model up with the key — checks both without
 * generating any text. Rejects on a bad key, unknown model or no network.
 */
export async function checkGeminiModel(
  config: { apiKey: string; model: string },
  signal?: AbortSignal,
): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  await ai.models.get({ model: config.model, config: { abortSignal: signal } });
}
