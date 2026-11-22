import { once } from 'node:events';
import { httpServer, type HttpHandler } from '../src/http/server.js';

export async function withHttp<T>(handler: HttpHandler, work: (origin: string) => Promise<T>) {
  const server = httpServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture address unavailable.');
    return await work('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
