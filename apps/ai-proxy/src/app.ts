// Express app with the SR-02 controls: Helmet, CORS allow-list, 20 KB body limit,
// rate limit, schema validation, timeout and generic error messages.

import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { ProxyConfig } from './config';
import { type GenerateSummary, handleSummary, MESSAGES } from './handler';
import { createLogger, type Logger } from './logger';

export const BODY_LIMIT = '20kb';

export interface AppOptions {
  config: ProxyConfig;
  generate: GenerateSummary;
  log?: Logger;
  timeoutMs?: number;
  /** Requests per window per IP (default 10 per minute). */
  rateLimit?: { limit: number; windowMs: number };
}

export function createApp(options: AppOptions): express.Express {
  const { config, generate } = options;
  const log = options.log ?? createLogger([config.apiKey]);
  const allowed = new Set(config.allowedOrigins);
  const isAllowed = (origin: string | undefined) => origin !== undefined && allowed.has(origin);

  const app = express();
  // Replit and Vercel sit behind one proxy; needed for per-IP rate limiting.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowed(origin)),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  // Health check: reveals nothing about the configuration.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const requireAllowedOrigin: RequestHandler = (req, res, next) => {
    if (isAllowed(req.headers.origin)) return next();
    log.info('Rejected request from an origin that is not allowed');
    res.status(403).json({ error: MESSAGES.forbidden });
  };

  const limiter = rateLimit({
    windowMs: options.rateLimit?.windowMs ?? 60_000,
    limit: options.rateLimit?.limit ?? 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: MESSAGES.rateLimited });
    },
  });

  app.post(
    '/api/summary',
    requireAllowedOrigin,
    limiter,
    express.json({ limit: BODY_LIMIT }),
    async (req, res) => {
      const result = await handleSummary(req.body, {
        generate,
        model: config.model,
        log,
        timeoutMs: options.timeoutMs,
      });
      res.status(result.status).json(result.body);
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ error: MESSAGES.notFound });
  });

  // Express only treats a 4-argument function as an error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (error: { type?: string }, _req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: MESSAGES.tooLarge });
      return;
    }
    if (error?.type === 'entity.parse.failed' || error?.type === 'encoding.unsupported') {
      res.status(400).json({ error: MESSAGES.invalidRequest });
      return;
    }
    log.error('Unhandled error', error);
    res.status(500).json({ error: MESSAGES.internal });
  };
  app.use(onError);

  return app;
}
