import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { apiError } from './response.js';

export type HttpHandler = (request: Request) => Response | Promise<Response>;

export function httpServer(handler: HttpHandler, origin?: string) {
  const serverOrigin = origin ? new URL(origin).origin : undefined;
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (incoming, outgoing) => {
    const method = incoming.method ?? 'GET';
    const cancellation = new AbortController();
    outgoing.once('close', () => { if (!outgoing.writableFinished) cancellation.abort(); });
    let response;
    try {
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//') || incoming.url.includes('\\')) {
        response = apiError(400, 'invalid_request');
      } else if (incoming.url.length > 8192) {
        response = apiError(414, 'url_too_long');
      } else {
        const headers = Object.entries(incoming.headers).map(([key, value]): [string, string] =>
          [key, Array.isArray(value) ? value.join(', ') : value ?? '']);
        const init: RequestInit & { duplex?: 'half' } = { method, signal: cancellation.signal, headers };
        if (method !== 'GET' && method !== 'HEAD') {
          init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
          init.duplex = 'half';
        }
        const requestOrigin = serverOrigin ?? 'http://127.0.0.1:' + incoming.socket.localPort;
        response = await handler(new Request(requestOrigin + incoming.url, init));
      }
    } catch {
      response = apiError(500, 'internal_error');
    }
    if (outgoing.destroyed) return;
    try {
      const body = method === 'HEAD' || !response.body ? undefined : Buffer.from(await response.arrayBuffer());
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)).end(body);
    } catch {
      outgoing.destroy();
    }
  });
}
