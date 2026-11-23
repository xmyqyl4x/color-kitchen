import { listenerFromEnvironment, publicOrigin, runtimeFromEnvironment } from './runtime-config.js';

export function cleanEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value.trim();
  }
  return cleaned;
}

export function resolveCliRuntime(rawEnv: NodeJS.ProcessEnv, warn: (message: string) => void = console.warn) {
  const env = cleanEnvironment(rawEnv);
  const connectionString = env.DATABASE_URL;

  if (env.NODE_ENV === 'production') {
    const runtime = runtimeFromEnvironment(env);
    if (!connectionString) throw new Error('Set DATABASE_URL to the PostgreSQL connection URL for this deployment.');
    return { env, isProduction: true as const, connectionString, runtime };
  }

  let origin: string | undefined;
  if (env.COLOR_KITCHEN_ORIGIN) {
    try {
      origin = publicOrigin(env.COLOR_KITCHEN_ORIGIN);
    } catch {
      try {
        const parsed = new URL(env.COLOR_KITCHEN_ORIGIN);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) {
          origin = publicOrigin(parsed.origin);
          warn(`[Color Kitchen] Normalized COLOR_KITCHEN_ORIGIN to ${origin}.`);
        } else {
          warn('[Color Kitchen] Ignoring invalid COLOR_KITCHEN_ORIGIN in development mode — deriving origin per request.');
        }
      } catch {
        warn('[Color Kitchen] Ignoring invalid COLOR_KITCHEN_ORIGIN in development mode — deriving origin per request.');
      }
    }
  }

  const listener = listenerFromEnvironment({ ...env, HOST: env.HOST ?? '0.0.0.0' });
  const indexing = env.COLOR_KITCHEN_INDEXING === 'false' ? false : true;
  return {
    env,
    isProduction: false as const,
    connectionString,
    runtime: {
      ...listener,
      origin,
      indexing,
      pool: { max: 10, connectionTimeoutMillis: 3000, statement_timeout: 5000 },
    },
  };
}
