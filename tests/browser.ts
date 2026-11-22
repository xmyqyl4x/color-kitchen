import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { Page } from 'playwright';

const compiled = new URL('../', import.meta.url);

export async function withBrowserPage<T>(work: (page: Page) => Promise<T>): Promise<T> {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Workspace fixture</title>');
      return;
    }
    if (!request.url || !/^\/src\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/i.test(request.url)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const source = await readFile(new URL('.' + request.url, compiled));
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(source);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Browser fixture address unavailable.');
    const browser = await chromium.launch({ executablePath: process.env.COLOR_KITCHEN_CHROMIUM_EXECUTABLE });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`);
      return await work(page);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
