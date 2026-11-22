import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { locales } from '../src/model/locales.js';
import { rollOut, type Exposure, type ReleaseLane } from '../src/release/rollout.js';
import { screenRoutes } from '../src/web/strings.js';

function localOrigin(value: string | undefined) {
  const url = new URL(value ?? '');
  assert(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && value === url.origin,
    'Expected an explicit HTTP origin on 127.0.0.1.');
  return url;
}

const [previousArg, candidateArg, portArg] = process.argv.slice(2);
const previous = localOrigin(previousArg);
const candidate = localOrigin(candidateArg);
const port = Number(portArg);
assert(Number.isInteger(port) && port > 1024 && port < 65536, 'Pass an available rollout port above 1024.');
const origin = 'http://127.0.0.1:' + port;
assert(new Set([previous.origin, candidate.origin, origin]).size === 3, 'Use distinct upstream and rollout ports.');
const slotHeader = 'x-ck-local-release-slot';
const laneHeader = 'x-ck-local-release-lane';
let exposure: Exposure = 0;
const server = createServer((incoming, outgoing) => {
  if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//') || incoming.url.includes('\\')) {
    outgoing.writeHead(400).end();
    return;
  }
  const value = incoming.headers[slotHeader];
  const slot = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : 99;
  const lane = slot < exposure ? 'candidate' : 'previous';
  const upstream = lane === 'candidate' ? candidate : previous;
  const headers = { ...incoming.headers };
  delete headers[slotHeader];
  delete headers[laneHeader];
  const proxy = request({ hostname: upstream.hostname, port: upstream.port, path: incoming.url,
    headers, method: incoming.method, timeout: 8000 }, response => {
    outgoing.writeHead(response.statusCode ?? 502, { ...response.headers, [laneHeader]: lane });
    response.pipe(outgoing);
  });
  proxy.on('timeout', () => proxy.destroy());
  proxy.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { [laneHeader]: lane }).end();
    else outgoing.destroy();
  });
  outgoing.on('close', () => proxy.destroy());
  incoming.pipe(proxy);
});

async function get(path: string, slot: number, method = 'GET') {
  return fetch(origin + path, { method, redirect: 'error', headers: { [slotHeader]: String(slot) },
    signal: AbortSignal.timeout(8000) });
}

async function publicContent(lane: ReleaseLane, slot: number) {
  const content: string[] = [];
  for (const locale of locales) {
    const responses: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await get('/api/v1/catalog/palette/forest-study?locale=' + locale, slot);
        const payload = await response.json();
        if (response.ok && response.headers.get(laneHeader) === lane && response.headers.get('content-language') === locale &&
            payload.data?.entry?.slug === 'forest-study') responses.push(JSON.stringify(payload.data.entry));
      } catch { /* The next fixed-budget request rechecks HTTP and JSON parsing. */ }
    }
    assert(responses.length >= 2, 'Repeated catalog API failures in ' + locale);
    const [entry, ...rechecks] = responses;
    assert(entry && rechecks.every(recheck => recheck === entry),
      'Catalog changed during the release check in ' + locale);
    content.push(entry);
  }
  return 'sha256:' + createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

async function browserSmoke(browser: Browser, lane: ReleaseLane, slot: number) {
  const context = await browser.newContext({ extraHTTPHeaders: { [slotHeader]: String(slot) }, serviceWorkers: 'block' });
  try {
    let blocked = 0;
    await context.route('**/*', route => {
      const req = route.request();
      if (new URL(req.url()).origin === origin && (req.method() === 'GET' || req.method() === 'HEAD')) return route.continue();
      blocked++;
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    for (const locale of locales) {
      const response = await page.goto(origin + '/' + locale);
      assert(response?.ok() && response.headers()[laneHeader] === lane && response.headers()['content-language'] === locale,
        'Localized navigation failed in ' + locale);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('main a[href="/' + locale + '/palette-studio"]').first().isVisible(), true);
    }
    for (const screen of screenRoutes.filter(route => route && route !== 'browser-companion')) {
      const response = await get('/en/' + screen, slot);
      assert(response.ok && response.headers.get(laneHeader) === lane, 'Public route failed: ' + screen);
      await response.body?.cancel();
    }
    await page.goto(origin + '/en/palette-studio');
    await page.locator('#studio-generate').click();
    await page.locator('#studio-export').click();
    await page.locator('#export-format').selectOption('pdf');
    const saved = page.waitForEvent('download');
    await page.locator('#export-download').click();
    assert.equal((await PDFDocument.load(await readFile(await (await saved).path()))).getPageCount(), 1);
    await page.goto(origin + '/en/color-guide');
    assert.equal(await page.locator('#guide-mode').inputValue(), 'local');
    await page.locator('#guide-submit').click();
    await page.locator('#guide-result .guide-chip').first().waitFor();
    for (const screen of ['collection', 'image-to-palette', 'moodboard', 'contact']) {
      const response = await page.goto(origin + '/de/' + screen);
      assert(response && response.ok() && response.headers()[laneHeader] === lane, 'Private route failed: ' + screen);
      assert.match(response.headers()['content-security-policy'] ?? '', /frame-src 'none'/);
      assert.equal(await page.locator('[data-ad-frame]').count(), 0);
    }
    assert.equal(blocked, 0, 'Private network egress or unexpected write during the release smoke check.');
  } finally {
    await context.close();
  }
}

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});
try {
  const chromiumBrowser = await chromium.launch({ executablePath: process.env.COLOR_KITCHEN_CHROMIUM_EXECUTABLE });
  try {
    const steps: Exposure[] = [];
    let previousContent: string | undefined;
    const result = await rollOut({
      async setExposure(percent) {
        exposure = percent;
        steps.push(percent);
        if (percent === 10) {
          let candidateSlots = 0;
          for (let slot = 0; slot < 100; slot++) {
            const response = await get('/api/v1/locales/en', slot, 'HEAD');
            assert(response.ok, 'A canary routing sample failed.');
            if (response.headers.get(laneHeader) === 'candidate') candidateSlots++;
          }
          assert.equal(candidateSlots, 10, 'Observed candidate exposure exceeds the canary budget.');
        }
      },
      async verify(lane) {
        const start = performance.now();
        const slot = lane === 'candidate' ? 0 : 99;
        const digest = await publicContent(lane, slot);
        await browserSmoke(chromiumBrowser, lane, slot);
        previousContent ??= digest;
        assert.equal(digest, previousContent, 'Published content pointer changed during the application rollout.');
        return { lane, elapsedMs: Math.round(performance.now() - start), publishedContentDigest: digest };
      },
    });
    console.log(JSON.stringify({ version: 1, target: 'local-docker-release', exposure: steps,
      locales, publishedContentDigest: result.publishedContentDigest, finalSmokeMs: result.elapsedMs, privateRequestsBlocked: 0 }, null, 2));
  } finally {
    await chromiumBrowser.close();
  }
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}
