// Local / Replit entry point: npm run dev -w apps/ai-proxy

import { createApp } from './app';
import { ConfigError, loadConfig } from './config';
import { createGeminiGenerator } from './gemini';
import { createLogger } from './logger';

// Load the repo-root .env when present (Replit Secrets / real env vars take precedence).
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // no .env file — use the environment as is
}

try {
  const config = loadConfig();
  const log = createLogger([config.apiKey]);
  const app = createApp({ config, generate: createGeminiGenerator(config), log });
  app.listen(config.port, () => {
    log.info(
      `Listening on port ${config.port} (model ${config.model}; allowed origins: ${config.allowedOrigins.join(', ')})`,
    );
  });
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'The AI proxy could not start.');
  process.exit(1);
}
