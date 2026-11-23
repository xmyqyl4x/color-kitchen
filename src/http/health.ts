import { listenerFromEnvironment, listenerUrl, loopbackHost } from './runtime-config.js';

const { host, port } = listenerFromEnvironment(process.env);
const probeHost = host === '0.0.0.0' ? loopbackHost : host === '::' ? '::1' : host;
const url = new URL('/api/v1/catalog/palette?locale=en&limit=1', listenerUrl(probeHost, port));
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
  await response.body?.cancel();
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
