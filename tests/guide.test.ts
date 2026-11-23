import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import pg from 'pg';
import { aiColorGuideProvider } from '../src/guide/ai-provider.js';
import { postgresGuideAdmission } from '../src/guide/admission.js';
import { localColorGuide } from '../src/guide/local.js';
import { guidePaletteEdit } from '../src/guide/response.js';
import { askColorGuide, type GuideInput, type GuideProviderInput } from '../src/guide/service.js';
import { parseColor } from '../src/color/parse.js';
import { applyPaletteCommand, openPaletteSession } from '../src/palette/document.js';
import { generatePalette } from '../src/palette/generate.js';
import { locales } from '../src/model/locales.js';
import { withMigratedDatabase } from './postgres.js';

const when = new Date('2026-11-22T12:00:00Z');
const base = { submitted: true, locale: 'en', prompt: 'Find a darker foreground' } satisfies GuideInput;
const admission = { async reserve() { return { accepted: true }; } };
const raw = (message: string) => ({
  message, colors: ['#070707', '#777777'], roles: [{ name: 'text', index: 0 }],
  contrasts: [{ foreground: '#070707', background: '#777777', backing: null }],
});

test('hosted Guide accepts explicit submissions in every locale and forwards only approved fields', async () => {
  const received: GuideProviderInput[] = [];
  const events: unknown[] = [];
  const translated = { en: 'Try a darker color.', fr: 'Essayez une teinte plus foncée.', es: 'Prueba un tono más oscuro.',
    pt: 'Experimente um tom mais escuro.', de: 'Probieren Sie einen dunkleren Farbton.' } as const;
  const provider = { async generate(request: GuideProviderInput) { received.push(request); return raw(translated[request.locale]); } };
  const deps = { provider, admission, now: () => when, measure: (event: unknown) => events.push(event) };
  const notSent = await askColorGuide({ ...base, submitted: false }, deps);
  assert(notSent.status === 'error' && notSent.code === 'not-submitted');
  assert.equal(received.length, 0);
  for (const locale of locales) {
    const payload = { ...base, locale, history: [{ role: 'user' as const, text: 'Earlier question', filename: 'private.png' }],
      shareSwatches: true, selectedColors: [{ ...parseColor('#00F'), localName: 'Secret swatch' }],
      collectionName: 'Private collection', image: new Blob(['private pixels']) };
    const reply = await askColorGuide(payload, deps);
    assert(reply.status === 'ready');
    assert.equal(reply.suggestion.message, translated[locale]);
    assert.equal(reply.suggestion.assessments[0]?.ratio.toFixed(2), '4.50');
    assert.equal(reply.suggestion.assessments[0]?.normal.aa.passes, false);
  }
  const notShared = await askColorGuide({ ...base, selectedColors: [parseColor('#00F')] }, deps);
  assert.equal(notShared.status, 'ready');
  assert.deepEqual(received.at(-1)?.colors, []);
  assert(received.every(value => JSON.stringify(Object.keys(value)) === '["locale","prompt","history","colors"]'));
  assert.doesNotMatch(JSON.stringify(received), /Private collection|private\.png|Secret swatch|private pixels/);
  assert.doesNotMatch(JSON.stringify(events), /Find a darker|Earlier question/);
});

test('budgets, timeout, provider errors and invalid structured results preserve the draft and offer offline help', async () => {
  const draft = Object.freeze({ ...base });
  let aborted = false;
  let providerCalls = 0;
  const stalled = {
    generate(_: GuideProviderInput, signal: AbortSignal) {
      providerCalls++;
      signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      return new Promise<unknown>(() => {});
    },
  };
  assert.deepEqual(await askColorGuide(draft, { provider: stalled, now: () => when }),
    { mode: 'hosted', status: 'error', code: 'unavailable', localAvailable: true });
  assert.equal(providerCalls, 0);
  const deps = { provider: stalled, admission, now: () => when, timeoutMs: 10 };
  const blocked = await askColorGuide(draft, { ...deps, admission: {
    async reserve() { return { accepted: false, retryAt: when }; },
  } });
  assert.deepEqual(blocked, { mode: 'hosted', status: 'error', code: 'limited', localAvailable: true, retryAt: when.toISOString() });
  assert.equal(providerCalls, 0);
  assert.deepEqual(await askColorGuide(draft, deps), { mode: 'hosted', status: 'error', code: 'timeout', localAvailable: true });
  assert(aborted);
  assert.equal(draft.prompt, base.prompt);
  for (const value of [raw('The ratio is 8:1.'), { ...raw('Try these.'), colors: ['garbage'] },
    { ...raw('Try these.'), contrasts: [{ foreground: '#fff', background: '#000', backing: null, ratio: 999 }] }]) {
    const reply = await askColorGuide(draft, { ...deps, provider: { async generate() { return value; } } });
    assert(reply.status === 'error' && reply.code === 'invalid-response');
  }
  const unavailable = await askColorGuide(draft, { ...deps, provider: { async generate() { throw new Error('upstream secret'); } } });
  assert.deepEqual(unavailable, { mode: 'hosted', status: 'error', code: 'unavailable', localAvailable: true });
  const local = locales.map(locale => localColorGuide(locale, { kind: 'palette', options: { seed: 8 } }));
  assert(local.every(result => result.mode === 'local' && result.suggestion.colors.length === 5));
  assert.equal(new Set(local.map(result => result.label)).size, 5);
});

test('the AI SDK adapter produces structured output with the mock model and applies one undoable suggestion', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      assert.match(JSON.stringify(options.prompt), /German \(de\)/);
      assert.match(JSON.stringify(options.prompt), /selectedColors/);
      return {
        content: [{ type: 'text', text: JSON.stringify(raw('Probieren Sie einen dunkleren Farbton.')) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  const reply = await askColorGuide({ ...base, locale: 'de' },
    { provider: aiColorGuideProvider(model), admission, now: () => when });
  assert(reply.status === 'ready');
  const session = openPaletteSession({ kind: 'palette', schemaVersion: 1, id: 'original', revision: 1, updatedAt: 1,
    name: 'Original', palette: generatePalette({ seed: 5 }) });
  const edit = guidePaletteEdit(reply.suggestion, ['swatch-2', 'swatch-3']);
  const applied = applyPaletteCommand(session, edit, { expectedRevision: 1, updatedAt: 2 });
  assert.equal(applied.undo.length, 1);
  assert.equal(applied.document.palette.roles.text, 'swatch-2');
  assert.deepEqual(applied.document.palette.swatches[1]?.color, parseColor('#070707'));
  const undone = applyPaletteCommand(applied, { type: 'undo' }, { expectedRevision: 2, updatedAt: 3 });
  assert.deepEqual(undone.document.palette, session.document.palette);
});

test('PostgreSQL reserves burst and provider capacity together and rolls back a denied budget', async () => {
  await withMigratedDatabase(async (client, connectionString) => {
    const pool = new pg.Pool({ connectionString });
    try {
      const gate = postgresGuideAdmission(pool, { burst: { limit: 3, windowSeconds: 60 }, provider: { limit: 10, windowSeconds: 3600 } });
      const results = await Promise.all([gate.reserve(7, when), gate.reserve(7, when)]);
      assert.equal(results.filter(value => value.accepted).length, 1);
      assert.equal(results.find(value => !value.accepted)?.retryAt?.toISOString(), '2026-11-22T13:00:00.000Z');
      const stored = await client.query('SELECT bucket, used FROM ck.guide_budget ORDER BY bucket');
      assert.deepEqual(stored.rows, [{ bucket: 'provider', used: '7' }, { bucket: 'service', used: '1' }]);
    } finally { await pool.end(); }
  });
});
