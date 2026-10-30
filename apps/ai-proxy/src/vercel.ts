// Shared Vercel entry: the same Express app as the local server, created once per
// function instance. Config errors fail loudly in the Vercel logs (no secrets printed).

import { createApp } from './app';
import { loadConfig } from './config';
import { createGeminiGenerator } from '@evm/platform/ai';
import { createLogger } from './logger';

export function createVercelApp() {
  const config = loadConfig();
  return createApp({
    config,
    generate: createGeminiGenerator(config),
    log: createLogger([config.apiKey]),
  });
}
