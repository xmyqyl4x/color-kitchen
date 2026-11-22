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
import { deliverCatalogInvalidation, revalidateCatalog } from '../catalog/invalidation.js';
import { httpServer } from './server.js';
import { webHttp } from '../web/http.js';
import { inquiryWebhook } from '../operations/inquiry-delivery.js';
import { publicSupport } from '../operations/public-support.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a migrated Color Kitchen database.');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Set PORT to a valid TCP port.');
const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
pool.on('error', () => console.error('An idle PostgreSQL client was disconnected.'));
async function withClient<T>(work: (client: ClientBase) => Promise<T>) {
  const client = await pool.connect();
  try { return await work(client); }
  finally { client.release(); }
}
const measurement = process.env.COLOR_KITCHEN_MEASUREMENT === 'true';
const catalog = catalogHttp({ withClient, measurement });
const verifyIdentity = identityFromEnvironment(process.env);
const projectThemes = projectThemesHttp({ withClient, verifyIdentity });
const adminCatalog = adminCatalogHttp({ withClient, verifyIdentity });
const gatewayKey = process.env.AI_GATEWAY_API_KEY;
const model = process.env.COLOR_KITCHEN_GUIDE_MODEL;
const provider = gatewayKey && model ? aiColorGuideProvider(createGateway({ apiKey: gatewayKey })(model)) : undefined;
function budget(name: string) {
  const value = Number(process.env[name] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e9) throw new Error('Invalid guide budget setting ' + name);
  return value;
}
const guide = guideHttp({ provider, now: () => new Date(),
  admission: postgresGuideAdmission(pool, {
    burst: { limit: budget('COLOR_KITCHEN_GUIDE_REQUESTS_PER_MINUTE'), windowSeconds: 60 },
    provider: { limit: budget('COLOR_KITCHEN_GUIDE_DAILY_UNITS'), windowSeconds: 86_400 },
  }),
});
function secret(name: string) {
  const setting = process.env[name];
  if (setting === undefined) return undefined;
  if (!/^[0-9a-f]{64}$/i.test(setting)) throw new Error('Invalid key format for ' + name);
  return Buffer.from(setting, 'hex');
}
const encryptKey = secret('COLOR_KITCHEN_CONTACT_ENCRYPT_KEY');
const hmacKey = secret('COLOR_KITCHEN_CONTACT_HMAC_KEY');
const keyId = process.env.COLOR_KITCHEN_CONTACT_KEY_ID ?? 'contact-v1';
const contactDays = Number(process.env.COLOR_KITCHEN_CONTACT_RETENTION_DAYS ?? 30);
if (!/^[a-z0-9_-]{1,48}$/i.test(keyId)) throw new Error('Invalid contact key identifier.');
if (!Number.isInteger(contactDays) || contactDays < 1 || contactDays > 365) throw new Error('Invalid inquiry retention period.');
const active = encryptKey && hmacKey ? { id: keyId, encryptKey, hmacKey } : undefined;
const contact = active ? { keys: { active, resolve: (id: string) => id === active.id ? active : undefined },
    retentionMs: contactDays * 86_400_000 } : undefined;
const operations = operationsHttp({
  withClient, measurement, contact,
  consentKey: secret('COLOR_KITCHEN_CONSENT_KEY'), eventKey: secret('COLOR_KITCHEN_EVENT_KEY'),
});
const web = webHttp({ withClient, measurement, verifyIdentity, adFrameUrl: process.env.COLOR_KITCHEN_AD_FRAME_URL });
const delivery = process.env.COLOR_KITCHEN_INQUIRY_WEBHOOK;
const deliver = delivery && contact ? inquiryWebhook({ url: delivery, token: process.env.COLOR_KITCHEN_INQUIRY_TOKEN ?? '',
  deduplicationMs: Number(process.env.COLOR_KITCHEN_INQUIRY_DEDUP_MS ?? 0) }) : undefined;
const server = httpServer(async request => {
  const { pathname } = new URL(request.url);
  if (pathname === guidePath) return guide(request);
  if (pathname.startsWith('/api/')) return await operations(request) ?? await projectThemes(request) ?? await adminCatalog(request) ?? catalog(request);
  return web(request);
},
  process.env.COLOR_KITCHEN_ORIGIN ?? 'http://localhost:' + port);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log('Color Kitchen HTTP server listening on port ' + port));
let stopping = false;
let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
let catalogTimer: ReturnType<typeof setTimeout> | undefined;
async function pollCatalog() {
  if (stopping) return;
  try { await withClient(client => deliverCatalogInvalidation(client, revalidateCatalog)); }
  catch { console.error('Catalog invalidation queue processing is temporarily unavailable.'); }
  if (!stopping) catalogTimer = setTimeout(pollCatalog, 5000).unref();
}
if (verifyIdentity) catalogTimer = setTimeout(pollCatalog, 5000).unref();
async function pollInquiries() {
  if (stopping || !contact || !deliver) return;
  try { await withClient(client => publicSupport({ client, ...contact, provider: deliver }).deliverNext()); }
  catch { console.error('Inquiry queue processing is temporarily unavailable.'); }
  if (!stopping) deliveryTimer = setTimeout(pollInquiries, 5000).unref();
}
if (deliver) deliveryTimer = setTimeout(pollInquiries, 5000).unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(deliveryTimer);
    clearTimeout(catalogTimer);
    server.close(() => { void pool.end(); });
  });
}
