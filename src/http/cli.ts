import pg, { type ClientBase } from 'pg';
import { createGateway } from 'ai';
import { aiColorGuideProvider } from '../guide/ai-provider.js';
import { postgresGuideAdmission } from '../guide/admission.js';
import { guideHttp, guidePath } from './guide.js';
import { catalogHttp } from './public-catalog.js';
import { operationsHttp } from './operations.js';
import { identityFromEnvironment } from './identity.js';
import { projectThemesHttp } from './project-themes.js';
import { adminCatalogHttp } from './admin-catalog.js';
import { accountHttp } from './account.js';
import { deliverCatalogInvalidation, revalidateCatalog } from '../catalog/invalidation.js';
import { httpServer } from './server.js';
import { webHttp } from '../web/http.js';
import { approvedAdFrame } from '../web/shell.js';
import { inquiryWebhook } from '../operations/inquiry-delivery.js';
import { publicSupport } from '../operations/public-support.js';
import { contactKeysFromEnvironment } from '../operations/contact-crypto.js';
import { createInMemoryCatalogClient } from '../db/in-memory-catalog.js';
import { createPool } from '../db/index.js';
import { resolveCliRuntime } from './cli-env.js';

const { env, isProduction, hasCloudSql, connectionString, runtime } = resolveCliRuntime(process.env);

let pool: pg.Pool | undefined;
if (hasCloudSql) {
  pool = createPool();
} else if (connectionString) {
  pool = new pg.Pool({ connectionString, ...runtime.pool });
  pool.on('error', () => console.error('An idle PostgreSQL client was disconnected.'));
} else {
  console.warn('[Color Kitchen] No PostgreSQL connection configured — running with in-memory seeded catalog.');
}

const memoryClient = pool ? undefined : createInMemoryCatalogClient();
const withClient: <T>(work: (client: ClientBase) => Promise<T>) => Promise<T> = pool
  ? async work => {
      const client = await pool.connect();
      try { return await work(client); }
      finally { client.release(); }
    }
  : async work => work(memoryClient!);

function optionalSetting<T>(name: string, parse: () => T): T | undefined {
  try {
    return parse();
  } catch (error) {
    if (isProduction) throw error;
    console.warn(`[Color Kitchen] Ignoring invalid ${name} in development mode: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const measurement = env.COLOR_KITCHEN_MEASUREMENT === 'true';
const catalog = catalogHttp({ withClient, measurement });
const verifyIdentity = optionalSetting('COLOR_KITCHEN_IDENTITY_*', () => identityFromEnvironment(env));
const projectThemes = projectThemesHttp({ withClient, verifyIdentity });
const adminCatalog = adminCatalogHttp({ withClient, verifyIdentity });
const gatewayKey = env.AI_GATEWAY_API_KEY;
const model = env.COLOR_KITCHEN_GUIDE_MODEL;
const provider = pool && gatewayKey && model ? aiColorGuideProvider(createGateway({ apiKey: gatewayKey })(model)) : undefined;
function budget(name: string) {
  const value = Number(env[name] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e9) {
    if (!isProduction) {
      console.warn(`[Color Kitchen] Ignoring invalid ${name} in development mode.`);
      return 0;
    }
    throw new Error('Invalid guide budget setting ' + name);
  }
  return value;
}
const guide = guideHttp({ provider, now: () => new Date(),
  admission: pool ? postgresGuideAdmission(pool, {
    burst: { limit: budget('COLOR_KITCHEN_GUIDE_REQUESTS_PER_MINUTE'), windowSeconds: 60 },
    provider: { limit: budget('COLOR_KITCHEN_GUIDE_DAILY_UNITS'), windowSeconds: 86_400 },
  }) : undefined,
});
function secret(name: string) {
  const setting = env[name];
  if (setting === undefined) return undefined;
  if (!/^[0-9a-f]{64}$/i.test(setting)) {
    if (!isProduction) {
      console.warn(`[Color Kitchen] Ignoring invalid ${name} in development mode.`);
      return undefined;
    }
    throw new Error('Invalid key format for ' + name);
  }
  return Buffer.from(setting, 'hex');
}
const contactKeys = optionalSetting('COLOR_KITCHEN_CONTACT_*', () => contactKeysFromEnvironment(env));
const rawContactDays = Number(env.COLOR_KITCHEN_CONTACT_RETENTION_DAYS ?? 30);
const contactDays = Number.isInteger(rawContactDays) && rawContactDays >= 1 && rawContactDays <= 365
  ? rawContactDays
  : (() => {
      if (isProduction) throw new Error('Invalid inquiry retention period.');
      console.warn('[Color Kitchen] Ignoring invalid COLOR_KITCHEN_CONTACT_RETENTION_DAYS in development mode.');
      return 30;
    })();
const contact = contactKeys ? { keys: contactKeys, retentionMs: contactDays * 86_400_000 } : undefined;
const operations = operationsHttp({
  withClient, measurement, contact,
  consentKey: secret('COLOR_KITCHEN_CONSENT_KEY'), eventKey: secret('COLOR_KITCHEN_EVENT_KEY'),
});
const web = webHttp({ withClient, measurement, verifyIdentity, indexing: runtime.indexing,
  adFrameUrl: optionalSetting('COLOR_KITCHEN_AD_FRAME_URL', () => approvedAdFrame(env.COLOR_KITCHEN_AD_FRAME_URL)?.href),
  allowEmbedding: !isProduction });
const delivery = env.COLOR_KITCHEN_INQUIRY_WEBHOOK;
const deliver = delivery && contact
  ? optionalSetting('COLOR_KITCHEN_INQUIRY_WEBHOOK', () => inquiryWebhook({ url: delivery, token: env.COLOR_KITCHEN_INQUIRY_TOKEN ?? '',
      deduplicationMs: Number(env.COLOR_KITCHEN_INQUIRY_DEDUP_MS ?? 0) }))
  : undefined;
const account = accountHttp();
const server = httpServer(async request => {
  const { pathname } = new URL(request.url);
  if (pathname === guidePath) return guide(request);
  if (pathname.startsWith('/api/')) return await account(request) ?? await operations(request) ?? await projectThemes(request) ?? await adminCatalog(request) ?? catalog(request);
  return web(request);
}, runtime.origin);
server.listen(runtime.port, runtime.host, () => console.log(`Color Kitchen HTTP server listening on http://${runtime.host}:${runtime.port}`));
let stopping = false;
let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
let catalogTimer: ReturnType<typeof setTimeout> | undefined;
async function pollCatalog() {
  if (stopping) return;
  try { await withClient(client => deliverCatalogInvalidation(client, revalidateCatalog)); }
  catch { console.error('Catalog invalidation queue processing is temporarily unavailable.'); }
  if (!stopping) catalogTimer = setTimeout(pollCatalog, 5000).unref();
}
if (pool && verifyIdentity) catalogTimer = setTimeout(pollCatalog, 5000).unref();
async function pollInquiries() {
  if (stopping || !contact || !deliver) return;
  try { await withClient(client => publicSupport({ client, ...contact, provider: deliver }).deliverNext()); }
  catch { console.error('Inquiry queue processing is temporarily unavailable.'); }
  if (!stopping) deliveryTimer = setTimeout(pollInquiries, 5000).unref();
}
if (pool && deliver) deliveryTimer = setTimeout(pollInquiries, 5000).unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(deliveryTimer);
    clearTimeout(catalogTimer);
    server.close(() => { if (pool) void pool.end(); });
  });
}
