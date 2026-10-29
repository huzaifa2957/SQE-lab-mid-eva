// SR-02 controls of POST /api/summary, with the Gemini call mocked.

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { ProxyConfig } from '../src/config';
import { type GenerateSummary, MESSAGES } from '../src/handler';
import { createLogger } from '../src/logger';
import { tasks, validBody } from './fixtures';

const SECRET = 'AIzaTEST-secret-key-1234567890';
const ORIGIN = 'http://localhost:5173';

const config: ProxyConfig = {
  apiKey: SECRET,
  model: 'test-model',
  allowedOrigins: [ORIGIN],
  port: 3001,
};

const aiSummary = {
  executiveSummary: 'The project is slightly over budget and behind schedule.',
  keyRisks: ['Cost overrun on requirements', 'Design is behind plan'],
  recommendations: ['Review design costs', 'Add a designer', 'Report the forecast'],
};

function setup(
  generate: GenerateSummary = async () => JSON.stringify(aiSummary),
  extra: Partial<Parameters<typeof createApp>[0]> = {},
) {
  const lines: string[] = [];
  const sink = { info: (m: string) => lines.push(m), error: (m: string) => lines.push(m) };
  const generateMock = vi.fn(generate);
  const app = createApp({
    config,
    generate: generateMock,
    log: createLogger([SECRET], sink),
    ...extra,
  });
  const post = (body: unknown, origin: string | null = ORIGIN) => {
    const req = request(app).post('/api/summary').set('Content-Type', 'application/json');
    if (origin) req.set('Origin', origin);
    return req.send(typeof body === 'string' ? body : JSON.stringify(body));
  };
  return { app, post, lines, generate: generateMock };
}

describe('POST /api/summary (FR-32, SR-02)', () => {
  it('PT-01 a valid request returns the parsed summary and model, with CORS for the allowed origin', async () => {
    const { post, generate } = setup();
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: aiSummary, model: 'test-model' });
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(generate).toHaveBeenCalledWith(validBody, expect.any(AbortSignal));
  });

  it('PT-02 accepts a fenced JSON answer', async () => {
    const { post } = setup(async () => `\`\`\`json\n${JSON.stringify(aiSummary)}\n\`\`\``);
    expect((await post(validBody)).status).toBe(200);
  });

  it('PT-03 an oversized body (> 20 KB) is rejected with 413 before the model is called', async () => {
    const { post, generate } = setup();
    const res = await post({ ...validBody, projectName: 'x'.repeat(21 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: MESSAGES.tooLarge });
    expect(generate).not.toHaveBeenCalled();
  });

  it('PT-04 invalid bodies are rejected with 400: bad JSON, wrong types, extra fields, raw tasks', async () => {
    const { post, generate } = setup();
    const cases: unknown[] = [
      '{ not json',
      {},
      [],
      { ...validBody, currency: 42 },
      { ...validBody, tasks },
      { ...validBody, metrics: { ...validBody.metrics, extra: 1 } },
      { ...validBody, insights: [{ ruleId: 'IN-01', status: 'green', message: '' }] },
    ];
    for (const body of cases) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(res.body).toEqual({ error: MESSAGES.invalidRequest });
    }
    const text = await request(setup().app)
      .post('/api/summary')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(text.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('PT-05 a request from another origin (or none) gets 403 and no CORS header', async () => {
    const { post, generate } = setup();
    const evil = await post(validBody, 'https://evil.example');
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: MESSAGES.forbidden });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect((await post(validBody, null)).status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it('PT-06 preflight from the allowed origin is answered; others get no CORS headers', async () => {
    const { app } = setup();
    const ok = await request(app)
      .options('/api/summary')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    const bad = await request(app)
      .options('/api/summary')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('PT-07 the 11th request in a minute from one IP gets a friendly 429', async () => {
    const { post } = setup();
    for (let i = 0; i < 10; i++) expect((await post(validBody)).status).toBe(200);
    const res = await post(validBody);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: MESSAGES.rateLimited });
  });

  it('PT-08 a model call slower than the timeout returns 504 and is aborted', async () => {
    let signal: AbortSignal | undefined;
    const { post } = setup(
      (_req, s) => {
        signal = s;
        return new Promise(() => {});
      },
      { timeoutMs: 50 },
    );
    const res = await post(validBody);
    expect(res.status).toBe(504);
    expect(res.body).toEqual({ error: MESSAGES.timeout });
    expect(signal?.aborted).toBe(true);
  });

  it('PT-09 malformed or schema-breaking AI output returns 502', async () => {
    const outputs = [
      'Sure! Here is your summary.',
      undefined,
      JSON.stringify({ ...aiSummary, recommendations: ['only one'] }),
      JSON.stringify({ ...aiSummary, executiveSummary: Array(121).fill('word').join(' ') }),
    ];
    for (const output of outputs) {
      const { post } = setup(async () => output);
      const res = await post(validBody);
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: MESSAGES.badGateway });
    }
  });

  it('PT-10 a model error returns a generic 502; the details are only logged', async () => {
    const { post, lines } = setup(async () => {
      throw new Error('quota exceeded for project 123');
    });
    const res = await post(validBody);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('quota');
    expect(lines.join('\n')).toContain('quota exceeded');
  });
});

describe('other routes and headers', () => {
  it('PT-11 health check says ok and reveals no configuration', async () => {
    const res = await request(setup().app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(JSON.stringify(res.body)).not.toMatch(/test-model|localhost|AIza/);
  });

  it('PT-12 Helmet security headers are set and Express is not advertised', async () => {
    const res = await request(setup().app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('PT-13 unknown routes and methods return a generic 404', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/summary')).status).toBe(404);
    const res = await request(app).get('/.env');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: MESSAGES.notFound });
  });
});

describe('API key never leaves the server (SR-01)', () => {
  it('PT-14 the key appears in no response body or header, and is redacted from logs', async () => {
    const generators: GenerateSummary[] = [
      async () => JSON.stringify(aiSummary),
      async () => {
        throw new Error(`API key ${SECRET} not valid`);
      },
      async () => 'not json',
    ];
    for (const generate of generators) {
      const { app, post, lines } = setup(generate);
      const responses = [
        await post(validBody),
        await post({}),
        await post(validBody, 'https://evil.example'),
        await request(app).get('/api/health'),
        await request(app).get('/nope'),
      ];
      for (const res of responses) {
        expect(JSON.stringify(res.body)).not.toContain(SECRET);
        expect(res.text).not.toContain(SECRET);
        expect(JSON.stringify(res.headers)).not.toContain(SECRET);
      }
      expect(lines.join('\n')).not.toContain(SECRET);
    }
  });
});
