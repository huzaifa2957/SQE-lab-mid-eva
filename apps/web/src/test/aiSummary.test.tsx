// AI summary panel (FR-32…FR-35, SR-03, RL-05) with the proxy mocked through fetch.

import type { ProjectDocument, StoredSummary } from '@evm/core';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAiSummary } from '../lib/aiClient';
import { buildSampleDocument } from '../lib/sampleProject';
import { renderApp } from './render';

const PROXY = 'http://proxy.test';
const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

const aiSummary = {
  executiveSummary: 'The project is over budget and behind schedule.',
  keyRisks: ['Cost overrun on fit-out tasks', 'Late electrical work'],
  recommendations: ['Hold a cost review', 'Re-plan electrical work', 'Report the new EAC'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('VITE_AI_PROXY_URL', PROXY);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function openInsights(documents: ProjectDocument[] = [sample()]) {
  const view = await renderApp({ documents, page: 'insights' });
  const generate = screen.getByRole('button', { name: 'Generate AI summary' });
  return { ...view, generate };
}

const summaryArticle = () => screen.findByRole('article', { name: 'Generated summary' });

async function expectOffline(reason: string, detail: RegExp) {
  const article = within(await summaryArticle());
  expect(article.getByText('Generated offline (rule-based)')).toBeInTheDocument();
  expect(article.getByText(reason)).toBeInTheDocument();
  expect(article.queryByText('AI-generated — verify before use')).not.toBeInTheDocument();
  expect(screen.getByText(detail)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  // the offline summary has the same three sections
  expect(article.getByText('Executive summary')).toBeInTheDocument();
  expect(article.getAllByRole('listitem').length).toBeGreaterThanOrEqual(5);
}

describe('AI summary panel', () => {
  it('CT-AI-01 success: sends aggregated data only and shows the AI-labelled summary', async () => {
    fetchMock.mockResolvedValue(json({ summary: aiSummary, model: 'test-model' }));
    const { user, generate, storage } = await openInsights();
    expect(generate).toHaveClass('bg-accent');
    await user.click(generate);

    const article = within(await summaryArticle());
    expect(article.getByText('AI-generated — verify before use')).toBeInTheDocument();
    expect(article.getByText(aiSummary.executiveSummary)).toBeInTheDocument();
    expect(article.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      ...aiSummary.keyRisks,
      ...aiSummary.recommendations,
    ]);
    expect(article.getByText(/Generated/).querySelector('time')).toHaveAttribute('dateTime');
    expect(screen.queryByText('Out of date')).not.toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${PROXY}/api/summary`);
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(
      [
        'anomalies',
        'anomalyCounts',
        'currency',
        'insights',
        'metrics',
        'projectName',
        'statusDate',
      ].sort(),
    );
    expect(body).not.toHaveProperty('tasks');

    // FR-35: kept with the project for the report
    await waitFor(async () => {
      const [saved] = (await storage.loadAll()) as ProjectDocument[];
      expect(saved!.aiSummary).toMatchObject({ source: 'ai', model: 'test-model', ...aiSummary });
    });
  });

  it('CT-AI-02 loading shows skeleton lines; after 20 s it times out, falls back and Retry works', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const { generate } = await openInsights();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(generate);

    const status = await screen.findByRole('status', { name: '' });
    expect(within(status).getByText('Generating summary…')).toBeInTheDocument();
    expect(generate).toBeDisabled();
    expect(generate.closest('section')).toHaveAttribute('aria-busy', 'true');

    await act(() => vi.advanceTimersByTimeAsync(19_000));
    expect(screen.queryByRole('article', { name: 'Generated summary' })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    await expectOffline('AI service timed out', /didn't answer within 20 seconds/);
    vi.useRealTimers();

    fetchMock.mockResolvedValue(json({ summary: aiSummary }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('AI-generated — verify before use')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('CT-AI-03 429 from the proxy → offline summary with a "busy" reason', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Too many' }, 429));
    const { user, generate } = await openInsights();
    await user.click(generate);
    await expectOffline('AI service busy', /Too many AI requests were made in the last minute/);
  });

  it('CT-AI-04 500 from the proxy → offline summary, no raw error shown', async () => {
    fetchMock.mockResolvedValue(
      new Response('Internal Server Error: stack trace…', { status: 500 }),
    );
    const { user, generate } = await openInsights();
    await user.click(generate);
    await expectOffline('AI service unavailable', /The AI service is unavailable at the moment/);
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();
  });

  it('CT-AI-05 network failure → offline summary', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { user, generate } = await openInsights();
    await user.click(generate);
    await expectOffline('AI service unavailable', /couldn't be reached/);
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('CT-AI-06 an invalid AI response (wrong shape or 502) → offline summary', async () => {
    fetchMock.mockResolvedValue(json({ summary: { ...aiSummary, recommendations: ['one'] } }));
    const { user, generate } = await openInsights();
    await user.click(generate);
    await expectOffline('AI response could not be used', /wasn't in the expected format/);

    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await expectOffline('AI response could not be used', /wasn't in the expected format/);
  });

  it('CT-AI-07 no proxy URL → offline summary without any network call', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', '');
    const { user, generate } = await openInsights();
    await user.click(generate);
    await expectOffline('AI service not configured', /No AI service is set up/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CT-AI-08 AI text containing HTML/script is rendered as plain text (SR-03)', async () => {
    const evil = {
      executiveSummary: '<script>window.__pwned = true</script> Summary <b>bold</b>',
      keyRisks: ['<img src=x onerror="window.__pwned=true">', 'Normal risk'],
      recommendations: ['<a href="javascript:alert(1)">Click</a>', 'Two', 'Three'],
    };
    fetchMock.mockResolvedValue(json({ summary: evil }));
    const { user, generate } = await openInsights();
    await user.click(generate);
    const article = await summaryArticle();
    expect(within(article).getByText(evil.executiveSummary)).toBeInTheDocument();
    expect(within(article).getByText(evil.keyRisks[0]!)).toBeInTheDocument();
    expect(article.querySelector('script, img, a, b')).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('CT-AI-09 Cancel stops the request and keeps the previous state', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const { user, generate } = await openInsights();
    await user.click(generate);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Generating summary…')).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Generated summary' })).not.toBeInTheDocument();
    expect(screen.getByText(/No summary yet/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
  });

  it('CT-AI-10 a stored summary loads with the project and is marked "Out of date" when data changed', async () => {
    const stored: StoredSummary = {
      ...aiSummary,
      source: 'offline',
      reason: 'AI service unavailable',
      generatedAt: '2026-04-03T09:30:00.000Z',
      fingerprint: '00000000',
    };
    const { user, generate } = await openInsights([{ ...sample(), aiSummary: stored }]);
    const article = within(await summaryArticle());
    expect(article.getByText('Generated offline (rule-based)')).toBeInTheDocument();
    expect(article.getByText('AI service unavailable')).toBeInTheDocument();
    expect(article.getByText('Out of date').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    );

    fetchMock.mockResolvedValue(json({ summary: aiSummary }));
    await user.click(generate);
    await screen.findByText('AI-generated — verify before use');
    expect(screen.queryByText('Out of date')).not.toBeInTheDocument();
  });

  it('CT-AI-11 editing a task after generating marks the summary "Out of date"', async () => {
    fetchMock.mockResolvedValue(json({ summary: aiSummary }));
    const { user, generate } = await openInsights();
    await user.click(generate);
    await screen.findByText('AI-generated — verify before use');

    await user.click(screen.getByRole('button', { name: 'Data' }));
    await user.click(screen.getByRole('button', { name: 'Edit task 1.1' }));
    const actual = screen.getByRole('textbox', { name: 'Actual cost' });
    await user.clear(actual);
    await user.type(actual, '99999{Enter}');
    await user.click(screen.getByRole('button', { name: 'Insights' }));
    expect(await screen.findByText('Out of date')).toBeInTheDocument();
  });
});

describe('requestAiSummary (FR-33)', () => {
  const request = {} as Parameters<typeof requestAiSummary>[1];

  it('CT-AI-12 maps statuses and errors to reasons and never throws', async () => {
    const cases: [() => Promise<Response>, string][] = [
      [async () => json({ error: 'x' }, 504), 'timeout'],
      [async () => json({ error: 'x' }, 502), 'invalid'],
      [async () => json({ error: 'x' }, 403), 'server'],
      [async () => json({ nope: true }), 'invalid'],
    ];
    for (const [impl, reason] of cases) {
      await expect(
        requestAiSummary(PROXY, request, { fetchImpl: impl as typeof fetch }),
      ).resolves.toEqual({
        ok: false,
        reason,
      });
    }
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      requestAiSummary(PROXY, request, {
        signal: cancelled.signal,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
