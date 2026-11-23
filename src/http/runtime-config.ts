import { isIP } from 'node:net';

export const loopbackHost = '127.0.0.1';
const loopbackHosts = new Set(['localhost', loopbackHost, '::1', '::ffff:127.0.0.1']);

export function isLoopbackHost(host: string) {
  return loopbackHosts.has(host.toLowerCase());
}

export function listenerUrl(host: string, port: number) {
  const authority = isIP(host) === 6 ? '[' + host + ']' : host;
  return new URL('http://' + authority + ':' + port);
}

function integer(value: string | undefined, name: string, fallback: number, maximum = 2_147_483_647) {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(result) || result < 1 || result > maximum) {
    throw new RangeError('Set ' + name + ' to an integer from 1 to ' + maximum + '.');
  }
  return result;
}

export function listenerFromEnvironment(env: NodeJS.ProcessEnv) {
  const host = (env.HOST ?? loopbackHost).trim().replace(/^\[([0-9a-f:.]+)\]$/i, '$1');
  if (!isIP(host) && !/^[a-z0-9_.-]+$/i.test(host)) {
    throw new RangeError('Set HOST to a hostname or IP address.');
  }
  return { host, port: integer(env.PORT, 'PORT', 3000, 65_535) };
}

export function publicOrigin(value: string) {
  const invalid = () => new RangeError('Set COLOR_KITCHEN_ORIGIN to a full HTTP or HTTPS origin without a path, credentials, query, or fragment.');
  const setting = value.trim();
  if (!/^https?:\/\/[^/?#\\]+\/?$/i.test(setting)) throw invalid();
  let url: URL;
  try { url = new URL(setting); } catch { throw invalid(); }
  if (url.username || url.password || url.href !== url.origin + '/') throw invalid();
  return url.origin;
}

export function runtimeFromEnvironment(env: NodeJS.ProcessEnv) {
  const listener = listenerFromEnvironment(env);
  const origin = env.COLOR_KITCHEN_ORIGIN === undefined ? undefined : publicOrigin(env.COLOR_KITCHEN_ORIGIN);
  if (!origin && (env.NODE_ENV === 'production' || !isLoopbackHost(listener.host))) {
    throw new Error('Set COLOR_KITCHEN_ORIGIN to the public origin for this deployment.');
  }
  const indexing = env.COLOR_KITCHEN_INDEXING;
  if (indexing !== undefined && indexing !== 'true' && indexing !== 'false') {
    throw new RangeError('Set COLOR_KITCHEN_INDEXING to true or false.');
  }
  return {
    ...listener, origin, indexing: indexing !== 'false',
    pool: {
      max: integer(env.COLOR_KITCHEN_DB_POOL_MAX, 'COLOR_KITCHEN_DB_POOL_MAX', 10),
      connectionTimeoutMillis: integer(env.COLOR_KITCHEN_DB_CONNECT_TIMEOUT_MS, 'COLOR_KITCHEN_DB_CONNECT_TIMEOUT_MS', 3000),
      statement_timeout: integer(env.COLOR_KITCHEN_DB_STATEMENT_TIMEOUT_MS, 'COLOR_KITCHEN_DB_STATEMENT_TIMEOUT_MS', 5000),
    },
  };
}
