import type { CatalogDraft, Metadata, Translation } from '../catalog/moderation-repository.js';
import type { catalogModeration } from '../catalog/moderation.js';
import { adminErrorMessage } from '../i18n/admin-errors.js';
import { isLocale, type Locale } from '../model/locales.js';
import { adminText, type AdminLabel } from './admin-text.js';
import { languageNames } from './strings.js';
import { clientLocale, get, node, press } from './ui.js';

type Catalog = ReturnType<typeof catalogModeration>;
type Page<T extends keyof Catalog> = Awaited<ReturnType<Catalog[T]>>;
type Draft = Omit<CatalogDraft, 'sealedAt'> & { sealedAt: string | null };
type Text = Omit<Translation, 'locale'>;
type Publication = { mode: 'publish' | 'rollback'; editVersion: string; itemVersion: string; key: string };

const root = get<HTMLDivElement>('catalog-admin');
const locale = clientLocale();
const t = (key: AdminLabel) => adminText(locale, key);
const apiBase = '/api/v1/admin/catalog';
const translation = get<HTMLFormElement>('admin-translation');
const metadata = get<HTMLFormElement>('admin-metadata');
const catalogFilter = get<HTMLFormElement>('admin-filter');
const auditFilter = get<HTMLFormElement>('admin-audit-filter');
const revisionSelect = get<HTMLSelectElement>('admin-revision-select');
const baseSelect = get<HTMLSelectElement>('admin-compare-base');
const languageSelect = get<HTMLSelectElement>('admin-language');
const message = get<HTMLParagraphElement>('admin-message');
const fields = ['title', 'summary', 'body'] as const;
const provenance = ['origin', 'licenseId', 'sourceUri', 'sourceVersion', 'sourceDigest', 'licenseUri', 'attribution', 'effectiveAt', 'payload'] as const;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

let draft: Draft | undefined;
let revisions: Page<'revisions'>['entries'] = [];
let nextRevision: number | null = null;
let nextItem: string | null = null;
let nextAudit: Page<'audit'>['next'] = null;
let catalogQuery = new URLSearchParams();
let auditQuery = new URLSearchParams();
let approval: Publication | null = null;
let stale = false;
let showCurrent = false;
let busy = false;
let metadataPending: Record<string, string> | null = null;
const pending = new Map<Locale, Text>();

const selectedLanguage = () => isLocale(languageSelect.value) ? languageSelect.value : locale;
const hasEdits = () => Boolean(pending.size || metadataPending);
const revisionPath = (itemId: string) => `/${itemId}/revisions`;
const pathForDraft = (value: Draft) => `${revisionPath(value.itemId)}/${value.revision}`;
const formValue = (form: HTMLFormElement, key: string) => form.elements.namedItem(key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

class PortalError extends Error {
  constructor(readonly status: number, message: string, readonly locales: Locale[] = []) { super(message); }
}

async function api<T>(path: string, query = new URLSearchParams(), options?: {
  method: 'POST' | 'PUT'; version: string; body: unknown; key?: string;
}) {
  const search = new URLSearchParams(query);
  search.set('locale', locale);
  const response = await fetch(apiBase + path + '?' + search, options ? {
    method: options.method, headers: { 'Content-Type': 'application/json', 'If-Match': `"${options.version}"`,
      ...(options.key ? { 'Idempotency-Key': options.key } : {}) }, body: JSON.stringify(options.body),
  } : undefined);
  const envelope = await response.json();
  if (!response.ok) throw new PortalError(response.status, envelope.error?.message ?? adminErrorMessage(locale, 'catalog_admin_unavailable'),
    Array.isArray(envelope.error?.locales) ? envelope.error.locales.filter(isLocale) : []);
  return envelope.data as T;
}

function announce(text: string, focus = false) {
  message.textContent = text;
  if (focus) message.focus();
}

function operate(work: () => Promise<void>) {
  return async (event?: Event) => {
    event?.preventDefault();
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try { await work(); }
    catch (error) {
      if (error instanceof PortalError) {
        if (error.status === 412 && draft) { stale = true; showCurrent = false; approval = null; }
        if (error.status === 409 || error.status === 410 || error.status === 422) approval = null;
        announce(error.message + (error.locales.length ? ' ' + error.locales.map(value => languageNames[value]).join(', ') : ''), true);
      } else { announce(adminErrorMessage(locale, 'catalog_admin_unavailable'), true); }
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
      renderControls();
    }
  };
}

function renderControls() {
  const editable = root.dataset.editor === 'true' && Boolean(draft && !draft.sealedAt);
  for (const field of fields) (formValue(translation, field) as HTMLInputElement | HTMLTextAreaElement).readOnly = !editable;
  for (const field of provenance) formValue(metadata, field).disabled = !editable;
  for (const id of ['admin-save-translation', 'admin-save-metadata']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) { button.hidden = !editable; button.disabled = stale; }
  }
  get('admin-pending').hidden = !hasEdits();
  get('admin-conflict').hidden = !stale && !showCurrent;
  get('admin-refresh').hidden = !stale;
  get('admin-current').hidden = !showCurrent;
  const publication = document.getElementById('admin-publish-panel');
  if (publication) {
    publication.hidden = !draft || draft.publishedRevision === draft.revision;
    const review = get<HTMLButtonElement>('admin-review'), publish = get<HTMLButtonElement>('admin-publish');
    review.textContent = t(draft?.sealedAt ? 'reviewRollback' : 'review');
    review.disabled = stale || hasEdits();
    publish.hidden = !approval;
    publish.textContent = t(approval?.mode === 'rollback' ? 'rollback' : 'publish');
  }
}

function pair(list: HTMLElement, label: string, value: string) { list.append(node('dt', label), node('dd', value)); }
function translationAt(value: Draft, language: Locale): Text {
  return value.translations.find(text => text.locale === language) ?? { title: '', summary: '', body: null };
}
function currentTranslation(): Text {
  return { title: formValue(translation, 'title').value, summary: formValue(translation, 'summary').value,
    body: formValue(translation, 'body').value || null };
}
function metadataValues(value: Metadata) {
  return Object.fromEntries(provenance.map(key => [key, key === 'payload' ? JSON.stringify(value.payload, null, 2) : String(value[key] ?? '')]));
}
function metadataInput(form: HTMLFormElement) {
  return Object.fromEntries(provenance.map(key => [key, formValue(form, key).value]));
}
function serializeMetadata(input: Record<string, string>) {
  try { return { ...Object.fromEntries(provenance.map(key => [key, input[key] || null])), payload: JSON.parse(input.payload ?? '') }; }
  catch { throw new PortalError(400, adminErrorMessage(locale, 'invalid_input')); }
}
function renderText(text: Text) {
  for (const field of fields) {
    const element = formValue(translation, field);
    element.value = text[field] ?? '';
    element.lang = selectedLanguage();
  }
}
function renderMetadata(values: Record<string, string>) {
  for (const key of provenance) formValue(metadata, key).value = values[key] ?? '';
}
function describeText(value: Text, language: Locale) {
  const content = node('dl', undefined, 'admin-version admin-copy');
  for (const key of fields) pair(content, t(key), value[key] ?? '—');
  for (const definition of content.querySelectorAll('dd')) definition.lang = language;
  return content;
}

function renderCurrent() {
  if (!draft || !showCurrent) return;
  const language = selectedLanguage(), values = get('admin-current-values');
  values.replaceChildren(describeText(translationAt(draft, language), language));
  if (metadataPending) values.append(node('h4', t('metadata')), node('pre', JSON.stringify(draft.metadata, null, 2)));
}

function renderRevisions() {
  if (!draft) return;
  const { revision, publishedRevision } = draft;
  const selectedBase = baseSelect.value;
  const options = revisions.map(entry => new Option(`${entry.revision} · ${t(entry.revision === publishedRevision ? 'published' : entry.sealedAt ? 'history' : 'draft')}`, String(entry.revision)));
  if (!revisions.some(entry => entry.revision === revision)) options.push(new Option(String(revision), String(revision)));
  revisionSelect.replaceChildren(...options);
  revisionSelect.value = String(revision);
  const other = options.filter(option => option.value !== String(revision));
  baseSelect.replaceChildren(...other.map(option => option.cloneNode(true)));
  if (other.some(option => option.value === selectedBase)) baseSelect.value = selectedBase;
  else if (other.some(option => option.value === String(publishedRevision))) baseSelect.value = String(publishedRevision);
  get('admin-revisions-more').hidden = nextRevision === null;
}

function renderDraft() {
  if (!draft) return;
  get('admin-choose').hidden = true;
  get('admin-revision').hidden = false;
  get('admin-item-heading').textContent = draft.slug;
  const version = get('admin-version');
  version.replaceChildren();
  pair(version, t('revision'), `${draft.revision} · ${t(draft.publishedRevision === draft.revision ? 'published' : draft.sealedAt ? 'history' : 'draft')}`);
  pair(version, t('publishedRevision'), draft.publishedRevision === null ? t('notPublished') : String(draft.publishedRevision));
  pair(version, t('itemVersion'), draft.itemVersion);
  pair(version, t('editVersion'), draft.editVersion);
  pair(version, t('itemId'), draft.itemId);
  const coverage = get('admin-coverage');
  coverage.replaceChildren();
  const languages = (items: Locale[]) => items.length ? items.map(code => languageNames[code]).join(', ') : t('none');
  pair(coverage, t('missing'), languages(draft.missingLocales));
  pair(coverage, t('outdated'), languages(draft.staleLocales));
  renderText(pending.get(selectedLanguage()) ?? translationAt(draft, selectedLanguage()));
  renderMetadata(metadataPending ?? metadataValues(draft.metadata));
  renderRevisions();
  renderCurrent();
  renderControls();
}

async function openDraft(itemId: string, revision: number, focus = true) {
  if (hasEdits()) { announce(t('unsaved'), true); return; }
  const [item, list] = await Promise.all([api<Draft>(`${revisionPath(itemId)}/${revision}`), api<Page<'revisions'>>(revisionPath(itemId))]);
  if (hasEdits()) { announce(t('unsaved'), true); return; }
  draft = item;
  revisions = list.entries;
  nextRevision = list.next;
  approval = null;
  stale = showCurrent = false;
  get('admin-diff').replaceChildren();
  renderDraft();
  announce('');
  const url = new URL(location.href);
  url.searchParams.set('item', itemId);
  url.searchParams.set('revision', String(revision));
  history.replaceState(null, '', url);
  if (focus) get('admin-item-heading').focus();
}

async function loadItems(more = false) {
  const query = new URLSearchParams(catalogQuery);
  if (more && nextItem) query.set('after', nextItem);
  const page = await api<Page<'items'>>('', query);
  nextItem = page.next;
  const list = get('admin-items');
  if (!more) list.replaceChildren();
  for (const item of page.entries) {
    const row = node('li');
    const button = press(item.slug, operate(() => openDraft(item.itemId, item.latestRevision)));
    button.dataset.itemId = item.itemId;
    row.append(button, node('span', `${t(item.kind)} · ${item.publishedRevision === null ? t('notPublished') : `${t('publishedRevision')} ${item.publishedRevision}`}`));
    list.append(row);
  }
  if (!list.childElementCount) list.append(node('li', t('empty')));
  get('admin-items-more').hidden = nextItem === null;
}

async function loadAudit(more = false) {
  const query = new URLSearchParams(auditQuery);
  if (more && nextAudit) { query.set('beforeTime', nextAudit.occurredAt); query.set('beforeId', nextAudit.eventId); }
  const page = await api<Page<'audit'>>('/audit', query);
  nextAudit = page.next;
  const list = get('admin-audit-entries');
  if (!more) list.replaceChildren();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  for (const event of page.entries) {
    const item = node('li');
    const time = node('time', date.format(new Date(event.occurredAt)));
    time.dateTime = event.occurredAt;
    const details = node('dl', undefined, 'admin-version');
    pair(details, t('itemId'), event.itemId);
    pair(details, t('actor'), event.principalId);
    item.append(node('strong', `${t(event.action === 'catalog.rollback' ? 'didRollback' : 'didPublish')} · ${event.previousRevision ?? '—'} → ${event.revision ?? '—'}`),
      time, details);
    list.append(item);
  }
  if (!list.childElementCount) list.append(node('li', t('empty')));
  get('admin-audit-more').hidden = nextAudit === null;
}

function queryForm(form: HTMLFormElement) {
  const query = new URLSearchParams();
  for (const [key, value] of new FormData(form)) if (typeof value === 'string' && value.trim()) query.set(key, value.trim());
  return query;
}

function operationId() {
  const timestamp = Date.now().toString(16).padStart(12, '0');
  return timestamp.slice(0, 8) + '-' + timestamp.slice(8) + '-7' + crypto.randomUUID().slice(15);
}

catalogFilter.addEventListener('submit', operate(async () => { catalogQuery = queryForm(catalogFilter); await loadItems(); }));
auditFilter.addEventListener('submit', operate(async () => { auditQuery = queryForm(auditFilter); await loadAudit(); }));
get('admin-items-more').addEventListener('click', operate(() => loadItems(true)));
get('admin-audit-more').addEventListener('click', operate(() => loadAudit(true)));
get('admin-revisions-more').addEventListener('click', operate(async () => {
  if (!draft || !nextRevision) return;
  const list = await api<Page<'revisions'>>(revisionPath(draft.itemId), new URLSearchParams({ before: String(nextRevision) }));
  revisions.push(...list.entries);
  nextRevision = list.next;
  renderRevisions();
}));
revisionSelect.addEventListener('change', operate(async () => {
  if (!draft) return;
  const chosen = Number(revisionSelect.value);
  revisionSelect.value = String(draft.revision);
  await openDraft(draft.itemId, chosen);
}));
languageSelect.addEventListener('change', () => {
  if (!draft) return;
  renderText(pending.get(selectedLanguage()) ?? translationAt(draft, selectedLanguage()));
  renderCurrent();
});
translation.addEventListener('input', () => {
  if (!draft || draft.sealedAt) return;
  const language = selectedLanguage(), entered = currentTranslation(), saved = translationAt(draft, language);
  if (fields.every(key => entered[key] === saved[key])) pending.delete(language);
  else pending.set(language, entered);
  approval = null;
  renderControls();
});
metadata.addEventListener('input', () => {
  if (!draft || draft.sealedAt) return;
  const entered = metadataInput(metadata), saved = metadataValues(draft.metadata);
  metadataPending = provenance.every(key => entered[key] === saved[key]) ? null : entered;
  approval = null;
  renderControls();
});
get('admin-discard').addEventListener('click', () => {
  if (busy) return;
  pending.clear();
  metadataPending = null;
  showCurrent = false;
  renderDraft();
  languageSelect.focus();
  announce('');
});
get('admin-refresh').addEventListener('click', operate(async () => {
  if (!draft) return;
  draft = await api<Draft>(pathForDraft(draft));
  stale = false;
  showCurrent = true;
  renderDraft();
  get('admin-current-heading').focus();
}));

async function reloadSavedDraft(path: string, savedVersion: string) {
  draft = await api<Draft>(path);
  stale = hasEdits() && draft.editVersion !== savedVersion;
  showCurrent = !stale && showCurrent && hasEdits();
  renderDraft();
  announce(stale ? adminErrorMessage(locale, 'stale_revision') : t('saved'), stale);
}

translation.addEventListener('submit', operate(async () => {
  if (!draft || draft.sealedAt || stale) return;
  const language = selectedLanguage(), text = currentTranslation(), buffer = pending.get(language), path = pathForDraft(draft);
  const saved = await api<{ editVersion: string }>(path + '/translations/' + language, undefined,
    { method: 'PUT', version: draft.editVersion, body: text });
  if (pending.get(language) === buffer) pending.delete(language);
  await reloadSavedDraft(path, saved.editVersion);
}));
metadata.addEventListener('submit', operate(async () => {
  if (!draft || draft.sealedAt || stale) return;
  const buffer = metadataPending, path = pathForDraft(draft);
  const saved = await api<{ editVersion: string }>(path + '/metadata', undefined,
    { method: 'PUT', version: draft.editVersion, body: serializeMetadata(metadataInput(metadata)) });
  if (buffer === metadataPending) metadataPending = null;
  await reloadSavedDraft(path, saved.editVersion);
}));
const create = document.querySelector<HTMLFormElement>('#admin-create');
create?.addEventListener('submit', operate(async () => {
  if (hasEdits()) { announce(t('unsaved'), true); return; }
  const item = await api<Draft>('', undefined, { method: 'POST', version: '0', body: {
    itemId: crypto.randomUUID(), kind: formValue(create, 'kind').value, slug: formValue(create, 'slug').value,
    metadata: serializeMetadata(metadataInput(create)),
  } });
  create.reset();
  await openDraft(item.itemId, item.revision);
  await loadItems();
}));
get('admin-fork')?.addEventListener('click', operate(async () => {
  if (!draft || stale) return;
  if (hasEdits()) { announce(t('unsaved'), true); return; }
  const fork = await api<Draft>(revisionPath(draft.itemId), undefined, {
    method: 'POST', version: draft.editVersion, body: { sourceRevision: draft.revision },
  });
  await openDraft(fork.itemId, fork.revision);
  await loadItems();
}));
get('admin-compare').addEventListener('submit', operate(async () => {
  if (!draft || !baseSelect.value) return;
  const diff = await api<NonNullable<Page<'compare'>>>(pathForDraft(draft) + '/comparison', new URLSearchParams({ base: baseSelect.value }));
  const result = get('admin-diff');
  result.replaceChildren();
  for (const entry of diff.translations) {
    const group = node('section', undefined, 'admin-diff-pair');
    const before = node('div'), after = node('div');
    before.append(node('h4', `${t('before')} · ${diff.baseRevision}`), entry.before ? describeText(entry.before, entry.locale) : node('p', t('none')));
    after.append(node('h4', `${t('after')} · ${diff.targetRevision}`), entry.after ? describeText(entry.after, entry.locale) : node('p', t('none')));
    result.append(node('h3', languageNames[entry.locale]), group);
    group.append(before, after);
  }
  if (diff.metadata) {
    const metadataDiff = node('div', undefined, 'admin-diff-pair');
    for (const key of ['before', 'after'] as const) {
      const column = node('div');
      column.append(node('h4', t(key)), node('pre', JSON.stringify(diff.metadata[key], null, 2)));
      metadataDiff.append(column);
    }
    result.append(node('h3', t('metadata')), metadataDiff);
  }
  if (!result.childElementCount) result.append(node('p', t('noChanges')));
}));
get('admin-review')?.addEventListener('click', operate(async () => {
  if (!draft || stale || hasEdits() || draft.publishedRevision === draft.revision) return;
  approval = null;
  const mode = draft.sealedAt ? 'rollback' : 'publish', editVersion = draft.editVersion, itemVersion = draft.itemVersion;
  await api(pathForDraft(draft) + '/review', undefined, { method: 'POST', version: itemVersion, body: { mode, editVersion } });
  approval = { mode, editVersion, itemVersion, key: operationId() };
  renderControls();
  get('admin-publish').focus();
  announce(t('checked'));
}));
get('admin-publish')?.addEventListener('click', operate(async () => {
  if (!draft || !approval || stale || hasEdits()) return;
  const { mode, editVersion, itemVersion, key } = approval;
  await api(pathForDraft(draft) + '/publication', undefined, { method: 'POST', version: itemVersion, key, body: { mode, editVersion } });
  approval = null;
  const confirmation = t(mode === 'rollback' ? 'rolledBack' : 'published');
  try {
    await openDraft(draft.itemId, draft.revision, false);
    await Promise.all([loadItems(), loadAudit()]);
    announce(confirmation, true);
  } catch { announce(confirmation + ' ' + adminErrorMessage(locale, 'catalog_admin_unavailable'), true); }
}));

window.addEventListener('beforeunload', event => {
  if (hasEdits()) { event.preventDefault(); event.returnValue = ''; }
});

void operate(async () => {
  await Promise.all([loadItems(), loadAudit()]);
  const url = new URL(location.href), item = url.searchParams.get('item'), revision = url.searchParams.get('revision');
  if (item && uuid.test(item) && revision && /^[1-9][0-9]{0,8}$/.test(revision)) await openDraft(item, Number(revision), false);
})();
