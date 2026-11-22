import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { publishLocalizedRevision } from '../src/catalog/publication.js';
import { operationsHttp } from '../src/http/operations.js';
import { locales } from '../src/model/locales.js';
import { inquiryWebhook } from '../src/operations/inquiry-delivery.js';
import { publicSupport } from '../src/operations/public-support.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('localized trust pages expose published versions and actual browser intake retries a durable receipt', async () => {
  await withMigratedDatabase(async client => {
    for (const slug of ['licensing', 'terms', 'privacy', 'cookies']) {
      const id = randomUUID();
      await client.query("INSERT INTO ck.catalog_item (item_id,kind,slug) VALUES ($1,'policy',$2)", [id, slug]);
      await client.query("INSERT INTO ck.catalog_revision (item_id,rev,payload,origin,license_id,attribution,effective_at) VALUES ($1,1,'{}','original','fixture','Fixture','2026-01-01')", [id]);
      for (const locale of locales) await client.query('INSERT INTO ck.catalog_text VALUES ($1,1,$2,$3,$4,$5)',
        [id, locale, slug + ' ' + locale, 'Summary ' + locale, 'Verified fixture body ' + locale]);
      await publishLocalizedRevision(client, { itemId: id, revision: 1, itemVersion: 1, editVersion: 6 });
    }
    const active = { id: 'qa', encryptKey: randomBytes(32), hmacKey: randomBytes(32) };
    const contact = { keys: { active, resolve: () => active }, retentionMs: 172_800_000 };
    const deps = { withClient: <T>(work: (database: typeof client) => Promise<T>) => work(client) };
    const web = webHttp(deps);
    const ops = operationsHttp({ ...deps, contact });
    const requests: string[] = [];
    await withHttp(async request => {
      if (new URL(request.url).pathname === '/api/v1/inquiries/contact') {
        requests.push((await request.clone().json()).requestId);
        if (requests.length === 1) {
          await ops(request);
          return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return await ops(request) ?? web(request);
    }, async origin => {
      for (const locale of locales) for (const route of ['licensing', 'terms', 'privacy', 'cookies', 'cookie-preferences', 'contact', 'advertise']) {
        const response = await fetch(origin + '/' + locale + '/' + route);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-language'), locale);
        const body = await response.text();
        if (['licensing', 'terms', 'privacy', 'cookies'].includes(route)) {
          assert.match(body, new RegExp('Verified fixture body ' + locale));
          assert.match(body, /datetime="2026-01-01/);
        }
      }
      await withBrowserPage(async page => {
        await page.goto(origin + '/en/contact');
        await page.locator('#inquiry-purpose').selectOption('accessibility');
        await page.locator('#inquiry-email').fill('fixture@example.test');
        await page.locator('#inquiry-message').fill('Synthetic message');
        await page.locator('#inquiry-submit').click();
        await page.getByText('Your message is still here.', { exact: false }).waitFor();
        assert.equal(await page.locator('#inquiry-message').inputValue(), 'Synthetic message');
        await page.locator('#inquiry-submit').click();
        await page.getByText('Your inquiry was accepted for delivery.', { exact: false }).waitFor();
      });
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0], requests[1]);
    const deliveries: string[] = [];
    const provider = inquiryWebhook({ url: 'https://receiver.example.test/', token: 'dummy', deduplicationMs: 300_000 },
      async (url, init) => {
        assert.equal(String(url), 'https://receiver.example.test/');
        const headers = new Headers(init?.headers);
        deliveries.push(headers.get('Idempotency-Key')!);
        assert.equal(JSON.parse(String(init?.body)).replyEmail, 'fixture@example.test');
        return new Response(null, { status: 202, headers: { 'X-Delivery-Receipt': 'fixture' } });
      });
    const worker = publicSupport({ client, ...contact, provider });
    assert.equal(await worker.deliverNext(), 'sent');
    assert.equal(await worker.deliverNext(), 'empty');
    assert.deepEqual(deliveries, ['color-kitchen-contact-' + requests[0]]);
  });
});

test('optional ad frames respect reject, no-fill, withdrawal and clean private navigation', async () => {
  const frame = 'https://ads.example.test/frame';
  const deps = { async withClient(): Promise<never> { throw new Error('These surfaces are browser local.'); } };
  const ops = operationsHttp({ ...deps, consentKey: randomBytes(32) });
  const web = webHttp({ ...deps, adFrameUrl: frame });
  await withHttp(async request => await ops(request) ?? web(request), origin => withBrowserPage(async page => {
    let seen = 0;
    await page.route(frame, async route => {
      assert.equal(route.request().headers().referer, undefined);
      seen++;
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>No inventory</title>' });
    });
    await page.setViewportSize({ width: 1360, height: 800 });
    await page.goto(origin + '/en/cookie-preferences');
    await page.locator('#trust-deny:enabled').press('Enter');
    await page.getByText('Preferences saved.').waitFor();
    await page.goto(origin + '/en/palette-studio');
    await page.locator('[data-swatch-id]').first().waitFor();
    const slot = page.locator('.ad-frame');
    const empty = await slot.boundingBox();
    assert.equal(seen, 0);
    assert.equal(await slot.locator('iframe').count(), 0);
    await page.goto(origin + '/en/cookie-preferences');
    await page.locator('#trust-accept:enabled').press('Enter');
    await page.getByText('Preferences saved.').waitFor();
    await page.goto(origin + '/en/palette-studio');
    await page.frameLocator('.ad-frame iframe').locator('title').waitFor({ state: 'attached' });
    assert.deepEqual(await slot.boundingBox(), empty);
    assert.equal(seen, 1);
    assert.equal(await slot.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
    const privatePage = await page.goto(origin + '/en/image-to-palette');
    assert.match(privatePage?.headers()['content-security-policy'] ?? '', /frame-src 'none'/);
    assert.equal(await page.locator('script[src$="ad-client.js"]').count(), 0);
    await page.goto(origin + '/en/cookie-preferences');
    await page.locator('#trust-deny:enabled').press('Enter');
    await page.getByText('Preferences saved.').waitFor();
    await page.goto(origin + '/en/palette-studio');
    await page.locator('[data-swatch-id]').first().waitFor();
    assert.equal(seen, 1);
    await page.locator('#studio-generate').click();
    assert.equal(seen, 1);
  }));
});
