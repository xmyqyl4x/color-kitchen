import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { parseColor } from '../src/color/parse.js';
import { postgresGuideAdmission } from '../src/guide/admission.js';
import type { GuideProviderInput } from '../src/guide/service.js';
import { guideHttp, guidePath } from '../src/http/guide.js';
import { locales } from '../src/model/locales.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

const now = () => new Date('2026-11-22T12:00:00.000Z');
const base = { submitted: true, locale: 'en', prompt: 'A darker foreground', shareSwatches: true,
  selectedColors: [parseColor('#585E78')], history: [{ role: 'user', text: 'Earlier question' }] };
const replies = { en: 'Try indigo.', fr: 'Essayez un indigo.', es: 'Prueba un añil.', pt: 'Experimente um índigo.',
  de: 'Probieren Sie Indigo.' } as const;

test('anonymous HTTP Guide serves all languages and throttles against the real budget', async () => {
  await withMigratedDatabase(async (_, connectionString) => {
    const pool = new pg.Pool({ connectionString });
    const input: GuideProviderInput[] = [];
    const guide = guideHttp({ now, provider: { async generate(value) {
      input.push(value);
      return { message: replies[value.locale], colors: ['#070707'], roles: [{ name: 'text', index: 0 }],
        contrasts: [{ foreground: '#070707', background: '#777777', backing: null }] };
    } }, admission: postgresGuideAdmission(pool, {
      burst: { limit: 5, windowSeconds: 60 }, provider: { limit: 20_000, windowSeconds: 86_400 },
    }) });
    try {
      await withHttp(guide, async origin => {
        const submit = (value: unknown) => fetch(origin + guidePath, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
        });
        for (const locale of locales) {
          const reply = await submit({ ...base, locale });
          assert.equal(reply.status, 200);
          const body = await reply.json();
          assert.equal(body.requestId, reply.headers.get('x-request-id'));
          assert.equal(reply.headers.get('content-language'), locale);
          assert.equal(reply.headers.get('cache-control'), 'no-store');
          assert.equal(body.data.suggestion.message, replies[locale]);
          assert.equal(body.data.suggestion.assessments[0].normal.aa.passes, false);
        }
        const limited = await submit(base);
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get('retry-after'), '60');
        assert.equal((await limited.json()).error.retryAt, '2026-11-22T12:01:00.000Z');
        assert.equal(input.length, 5);
        assert.deepEqual(input[0]?.colors, base.selectedColors);
        assert.deepEqual(input[0]?.history, base.history);
      });
    } finally { await pool.end(); }
  });
});

test('HTTP Guide rejects private fields and bounds the body, then maps timeout and invalid replies', async () => {
  let calls = 0;
  let aborted = false;
  const handler = guideHttp({ now, timeoutMs: 30, admission: { async reserve() { return { accepted: true }; } },
    provider: { generate(value, signal) {
      calls++;
      if (value.prompt === 'malformed') return Promise.resolve({ secret: 'fixture token' });
      if (value.prompt === 'failure') return Promise.reject(new Error('private provider configuration'));
      signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      return new Promise(() => {});
    } },
  });
  await withHttp(handler, async origin => {
    const post = (string: string, headers?: HeadersInit) => fetch(origin + guidePath, {
      method: 'POST', headers: headers ?? { 'Content-Type': 'application/json' }, body: string,
    });
    for (const value of [{ ...base, selectedColors: Array(13).fill(base.selectedColors[0]) },
      { ...base, shareSwatches: false }, { ...base, history: [{ ...base.history[0], filename: 'private.png' }] },
      { ...base, image: 'private bytes' }, { ...base, submitted: false }, { ...base, locale: 'xx' },
    ]) {
      const invalid = await post(JSON.stringify(value));
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.localAvailable, true);
    }
    const malformed = await post('{broken');
    assert.equal((await malformed.json()).error.code, 'invalid_json');
    const type = await post('{}', { 'Content-Type': 'text/plain' });
    assert.equal(type.status, 415);
    const large = await post(JSON.stringify({ ...base, prompt: 'é'.repeat(9000) }));
    assert.equal(large.status, 413);
    assert.equal((await large.json()).error.code, 'body_too_large');
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(9000));
      controller.enqueue(new Uint8Array(9000));
      controller.close();
    } });
    const streaming: RequestInit & { duplex: 'half' } = { method: 'POST', duplex: 'half',
      headers: { 'Content-Type': 'application/json' }, body: stream };
    assert.equal((await fetch(origin + guidePath, streaming)).status, 413);
    const crossOrigin = await post(JSON.stringify(base), { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' });
    assert.equal(crossOrigin.status, 403);
    assert.equal(calls, 0);
    for (const [prompt, status, code] of [
      ['malformed', 502, 'invalid-response'], ['failure', 503, 'unavailable'], ['stalled', 504, 'timeout'],
    ] as const) {
      const response = await post(JSON.stringify({ ...base, prompt }));
      assert.equal(response.status, status);
      const reply = await response.json();
      assert.equal(reply.error.code, code);
      assert.doesNotMatch(JSON.stringify(reply), /fixture token|private provider configuration|Earlier question/);
    }
    assert(aborted);
  });
});
