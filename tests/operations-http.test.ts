import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { operationsHttp } from '../src/http/operations.js';
import { publicSupport } from '../src/operations/public-support.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('HTTP inquiry replay delivers once and rejects channel, scope and content mismatches', async () => {
  await withMigratedDatabase(async client => {
    const active = { id: 'fixture', encryptKey: randomBytes(32), hmacKey: randomBytes(32) };
    const contact = { keys: { active, resolve: () => active }, retentionMs: 172_800_000 };
    const handler = operationsHttp({ withClient: work => work(client), contact });
    await withHttp(async request => (await handler(request)) ?? new Response(null, { status: 404 }), async origin => {
      const post = (path: string, body: unknown) => fetch(origin + '/api/v1/inquiries/' + path,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const inquiry = { requestId: randomUUID(), purpose: 'accessibility', locale: 'pt',
        replyEmail: 'fixture@EXAMPLE.COM', message: 'Exemplo de acessibilidade' };
      const first = await post('contact', inquiry);
      assert.equal(first.status, 202);
      assert.equal(first.headers.get('content-language'), 'pt');
      const receipt = { version: 1, data: { status: 'accepted', requestId: inquiry.requestId } };
      assert.deepEqual(await first.json(), receipt);
      assert.deepEqual(await (await post('contact', inquiry)).json(), receipt);
      assert.equal((await post('contact', { ...inquiry, filename: 'private.png' })).status, 400);
      assert.equal((await post('advertising', inquiry)).status, 400);
      assert.equal((await post('contact', { ...inquiry, message: 'Another message' })).status, 409);
      const delivered: string[] = [];
      const worker = publicSupport({ ...contact, client, provider: { deduplicationMs: 3600_000,
        async deliver(value) {
          delivered.push(value.requestId);
          assert.equal(value.replyEmail, 'fixture@example.com');
          return { delivered: true, reference: 'fixture' };
        },
      } });
      assert.equal(await worker.deliverNext(), 'sent');
      assert.equal(await worker.deliverNext(), 'empty');
      assert.equal((await post('contact', inquiry)).status, 202);
      assert.equal(await worker.deliverNext(), 'empty');
      assert.deepEqual(delivered, [inquiry.requestId]);
    });
  });
});

test('Chromium sends aggregate events only with consent, and withdrawals stop retries', async () => {
  await withMigratedDatabase(async client => {
    const item = sampleCatalog[0];
    await seedCatalog(client, [item]);
    const operations = operationsHttp({ withClient: work => work(client), measurement: true,
      consentKey: randomBytes(32), eventKey: randomBytes(32) });
    const eventBodies: string[] = [];
    await withHttp(async request => {
      const path = new URL(request.url).pathname;
      if (path === '/') return new Response('<!doctype html><title>Optional event fixture</title>',
        { headers: { 'Content-Type': 'text/html' } });
      if (path === '/src/browser/optional-requests.js' || path === '/src/operations/consent.js') {
        return new Response(await readFile(new URL('..' + path, import.meta.url), 'utf8'),
          { headers: { 'Content-Type': 'text/javascript' } });
      }
      if (path.startsWith('/api/v1/events/')) eventBodies.push(await request.clone().text());
      return (await operations(request)) ?? new Response(null, { status: 404 });
    }, async origin => {
      const result = await withBrowserPage(async page => {
        await page.goto(origin);
        return page.evaluate(async itemId => {
          const url = '/src/browser/optional-requests.js';
          const consentUrl = '/src/operations/consent.js';
          const { explicitCatalogOpen, firstPartyConsentAdapter } = await import(url) as typeof import('../src/browser/optional-requests.js');
          const { createConsentSession } = await import(consentUrl) as typeof import('../src/operations/consent.js');
          const cleared: boolean[] = [];
          const session = createConsentSession(firstPartyConsentAdapter(async choice => { cleared.push(!choice.analytics); }));
          await session.refresh();
          const denied = await explicitCatalogOpen(itemId, session.snapshot);
          await session.update({ advertising: false, analytics: true });
          const counted = await explicitCatalogOpen(itemId, session.snapshot);
          const first = await counted?.record();
          const retry = await counted?.record();
          await session.withdraw();
          const stopped = await counted?.record();
          const deniedAgain = await explicitCatalogOpen(itemId, session.snapshot);
          const tampered = await fetch('/api/v1/events/catalog-open', { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'a.' + 'A'.repeat(43) }) });
          const bad = await fetch('/api/v1/events/catalog-open', { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paletteName: 'Private draft' }) });
          return { denied, first, retry, stopped, deniedAgain, tampered: tampered.status, bad: bad.status,
            cleared, scriptCookies: document.cookie };
        }, item.itemId);
      });
      assert.deepEqual(result, { denied: null, first: true, retry: true, stopped: false, deniedAgain: null,
        tampered: 403, bad: 400, cleared: [false, true], scriptCookies: '' });
      assert.equal(eventBodies.length, 5);
      assert.deepEqual(JSON.parse(eventBodies[0]!), { itemId: item.itemId });
      assert.deepEqual(JSON.parse(eventBodies[1]!), JSON.parse(eventBodies[2]!));
      assert.deepEqual(Object.keys(JSON.parse(eventBodies[1]!)), ['token']);
      assert.equal((await client.query('SELECT event_count FROM ck.usage_day')).rows[0]?.event_count, '1');
    });
  });
});
