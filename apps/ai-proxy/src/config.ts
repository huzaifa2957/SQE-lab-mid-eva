// Environment configuration (SR-01). The key only ever lives in server env vars.

import { z } from 'zod';

export interface ProxyConfig {
  apiKey: string;
  model: string;
  allowedOrigins: string[];
  port: number;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is not set.'),
  GEMINI_MODEL: z
    .string()
    .trim()
    .min(
      1,
      'GEMINI_MODEL is not set. Choose a model name from Google AI Studio (for example a current "Flash" model) and set it in .env.',
    )
    .regex(
      /^[\w.\-/]*$/,
      'GEMINI_MODEL must be a model name such as the one shown in Google AI Studio.',
    ),
  ALLOWED_ORIGINS: z
    .string()
    .trim()
    .min(1, 'ALLOWED_ORIGINS is not set (comma-separated list, e.g. http://localhost:5173).')
    .transform((value) =>
      value
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    )
    .refine((origins) => origins.every(isOrigin), {
      message:
        'ALLOWED_ORIGINS must be origins like https://my-app.example (scheme + host, no path).',
    }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
});

/**
 * Reads and validates the configuration. Throws a ConfigError listing every problem;
 * the message never contains the value of any variable.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ProxyConfig {
  const parsed = EnvSchema.safeParse({
    GEMINI_API_KEY: env.GEMINI_API_KEY ?? '',
    GEMINI_MODEL: env.GEMINI_MODEL ?? '',
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS ?? '',
    PORT: env.PORT || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `- ${issue.message}`).join('\n');
    throw new ConfigError(`AI proxy configuration is incomplete:\n${problems}`);
  }
  return {
    apiKey: parsed.data.GEMINI_API_KEY,
    model: parsed.data.GEMINI_MODEL,
    allowedOrigins: parsed.data.ALLOWED_ORIGINS,
    port: parsed.data.PORT,
  };
}
