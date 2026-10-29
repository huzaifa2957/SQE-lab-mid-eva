// Gemini call through the official @google/genai SDK.

import type { SummaryRequest } from '@evm/core/ai';
import { GoogleGenAI } from '@google/genai';
import type { GenerateSummary } from './handler';
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
