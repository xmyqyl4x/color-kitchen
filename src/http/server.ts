import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { apiError } from './response.js';
import { isLoopbackHost, listenerUrl, loopbackHost, publicOrigin } from './runtime-config.js';

export type HttpHandler = (request: Request) => Response | Promise<Response>;

function localRequestOrigin(request: IncomingMessage) {
  const { localAddress = loopbackHost, localPort } = request.socket;
  if (!localPort) throw new Error('Listener port is unavailable.');
  // Direct loopback development can use localhost, IPv4, or IPv6 on the listener's actual port.
  const alias = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i.exec(request.headers.host ?? '');
  if (isLoopbackHost(localAddress) && alias && Number(alias[2] ?? 80) === localPort) {
    return 'http://' + alias[0].toLowerCase();
  }
  return listenerUrl(localAddress, localPort).origin;
}

function finishRejectedUpload(request: IncomingMessage) {
  if (request.complete || request.destroyed) return;
  return new Promise<void>(resolve => {
    let discarded = 0;
    const timeout = setTimeout(finish, 150);
    function finish() {
      clearTimeout(timeout);
      request.off('data', discard);
      request.off('end', finish);
      request.off('close', finish);
      resolve();
    }
    function discard(chunk: Buffer) {
      discarded += chunk.length;
      if (discarded >= 65_536) {
        request.pause();
        finish();
      }
    }
    request.once('end', finish).once('close', finish).on('data', discard);
    request.resume();
  });
}

export function httpServer(handler: HttpHandler, origin?: string) {
  const serverOrigin = origin === undefined ? undefined : publicOrigin(origin);
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
        const requestOrigin = serverOrigin ?? localRequestOrigin(incoming);
        response = await handler(new Request(requestOrigin + incoming.url, init));
      }
    } catch {
      response = apiError(500, 'internal_error');
    }
    if (outgoing.destroyed) return;
    try {
      // Give a finishing chunked upload time to reach EOF before closing its connection.
      if (response.status === 413) await finishRejectedUpload(incoming);
      if (outgoing.destroyed) return;
      const body = method === 'HEAD' || !response.body ? undefined : Buffer.from(await response.arrayBuffer());
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)).end(body);
    } catch {
      outgoing.destroy();
    }
  });
}
