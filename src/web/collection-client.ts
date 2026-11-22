import { openWorkspaceDatabase, WorkspaceStorageError } from '../browser/database.js';
import type { CreativeDocument } from '../browser/document.js';
import { createBrowserMedia } from '../browser/media.js';
import { workspaceRepository, type DeletedDocument } from '../browser/repository.js';
import { colorCss } from '../color/css.js';
import { readActiveDraft, storeActivePalette } from './draft.js';
import { openExportDrawer } from './export-drawer.js';
import { collectionText } from './collection-text.js';
import { clientLocale, get, node, press } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
const search = get<HTMLInputElement>('collection-search');
const file = get<HTMLInputElement>('collection-import');
const list = get<HTMLUListElement>('collection-items');
const status = get('collection-status');
const backup = get<HTMLButtonElement>('collection-backup');
const undo = get<HTMLButtonElement>('collection-undo');
const active = get<HTMLButtonElement>('collection-active');
let repository: ReturnType<typeof workspaceRepository> | undefined;
let items: readonly CreativeDocument[] = [];
let deleted: DeletedDocument | undefined;
try { repository = workspaceRepository(await openWorkspaceDatabase()); }
catch { status.textContent = t('storage'); }
const media = createBrowserMedia(repository);

function report(error: unknown) {
  status.textContent = t(error instanceof WorkspaceStorageError
    ? error.code === 'conflict' ? 'conflict' : 'storage' : 'invalid');
}

async function reload() {
  if (!repository) return;
  try {
    items = (await repository.backupSource(false)).documents;
    render();
  } catch (error) { report(error); }
}

function openPalette(item: Extract<CreativeDocument, { kind: 'palette' }>) {
  const current = readActiveDraft();
  if (current && current.saved?.editRevision !== current.document.revision &&
      !confirm(t('confirmOpen'))) return;
  if (!storeActivePalette(item, { storedRevision: item.revision, editRevision: item.revision })) {
    status.textContent = t('storage');
    return;
  }
  location.href = '/' + locale + '/palette-studio';
}

function render() {
  const fold = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
  const query = fold(search.value.trim());
  const matches = items.filter(item => fold([item.name, ...(item.tags ?? [])].join(' ')).includes(query))
    .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, locale));
  list.replaceChildren(...matches.map(item => {
    const card = node('li', undefined, 'collection-card');
    const strip = node('div', undefined, 'collection-strip');
    strip.setAttribute('aria-hidden', 'true');
    const colors = item.kind === 'gradient' ? item.stops.map(stop => stop.color) : item.palette.swatches.map(swatch => swatch.color);
    for (const color of colors) {
      const tile = node('span');
      tile.style.backgroundColor = colorCss(color);
      strip.append(tile);
    }
    const content = node('div', undefined, 'collection-card-body');
    content.append(node('h2', item.name));
    const label = node('label', t('tags'));
    const tags = node('input');
    tags.value = item.tags?.join(', ') ?? '';
    tags.maxLength = 400;
    label.append(tags);
    tags.addEventListener('change', async () => {
      const updated = [...new Set(tags.value.split(',').map(tag => tag.trim().normalize('NFC')).filter(Boolean))];
      if (updated.length > 12 || updated.some(tag => tag.length > 32)) { status.textContent = t('invalid'); return; }
      try {
        const saved = await repository!.saveDocument({ ...item, tags: updated }, { expectedRevision: item.revision, updatedAt: Date.now() });
        const draft = readActiveDraft();
        if (draft?.document.id === item.id && draft.saved?.storedRevision === item.revision) {
          storeActivePalette({ ...draft.document, tags: updated }, { ...draft.saved, storedRevision: saved.revision });
        }
        await reload();
      } catch (error) { report(error); }
    });
    const actions = node('div', undefined, 'studio-actions');
    if (item.kind === 'palette') actions.append(press(t('open'), () => openPalette(item)));
    actions.append(
      press(t('export'), () => openExportDrawer(locale, item, repository!.getAsset)),
      press(t('duplicate'), async () => {
        try {
          const suffix = ' · ' + t('copySuffix');
          await repository!.saveDocument({ ...item, id: crypto.randomUUID(), name: item.name.slice(0, 120 - suffix.length) + suffix },
            { expectedRevision: null, updatedAt: Date.now() });
          await reload();
        } catch (error) { report(error); }
      }),
      press(t('remove'), async () => {
        try {
          deleted = await repository!.deleteDocument(item.id, item.revision);
          const draft = readActiveDraft();
          if (draft?.document.id === item.id) storeActivePalette(draft.document);
          undo.hidden = false;
          undo.focus();
          await reload();
        } catch (error) { report(error); }
      }),
    );
    content.append(label, actions);
    card.append(strip, content);
    return card;
  }));
  if (!matches.length) list.append(node('li', t('empty')));
}

backup.disabled = file.disabled = !repository;
active.hidden = !readActiveDraft();
active.addEventListener('click', () => {
  const draft = readActiveDraft();
  if (draft) openExportDrawer(locale, draft.document, undefined, 'json');
});
backup.addEventListener('click', async () => {
  try {
    const includeAssets = get<HTMLInputElement>('collection-assets').checked;
    const result = await media.backup.fromStorage({ includeAssets });
    media.files.download(new Blob([result.text], { type: 'application/json' }), 'color-kitchen-collection.json');
    status.textContent = result.omittedAssetIds.length ? t('omitted') + ' · ' + result.omittedAssetIds.join(', ') : '';
  } catch (error) { report(error); }
});
undo.addEventListener('click', async () => {
  if (!deleted || !repository) return;
  undo.disabled = true;
  try {
    const restored = await repository.restoreDocument(deleted, Date.now());
    const draft = readActiveDraft();
    if (draft?.document.id === restored.id && !draft.saved && draft.document.revision === deleted.document.revision) {
      storeActivePalette(draft.document, { storedRevision: restored.revision, editRevision: draft.document.revision });
    }
    deleted = undefined;
    await reload();
    search.focus();
    undo.hidden = true;
  } catch (error) { report(error); }
  finally { undo.disabled = false; }
});
file.addEventListener('change', async () => {
  const selected = file.files?.[0];
  file.value = '';
  if (!selected) return;
  try {
    const preview = await media.backup.preview(selected);
    const dialog = node('dialog', undefined, 'studio export-drawer');
    const heading = node('h2', t('import'));
    heading.id = 'collection-import-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const names = node('ul');
    for (const document of preview.data.documents) names.append(node('li', document.name));
    for (const group of preview.data.collections) names.append(node('li', group.name));
    const message = node('p', preview.data.omittedAssetIds.length ? t('missing') : '');
    message.setAttribute('role', 'status');
    const restore = press(t('restore'), async () => {
      restore.disabled = true;
      try { await preview.restore(); await reload(); dialog.close(); status.textContent = t('restored'); }
      catch (error) {
        message.textContent = t(error instanceof WorkspaceStorageError && error.code === 'conflict' ? 'conflict' : 'invalid');
        restore.disabled = false;
      }
    }, true);
    restore.disabled = preview.data.omittedAssetIds.length > 0;
    const actions = node('div', undefined, 'studio-actions');
    actions.append(press(t('close'), () => dialog.close()), restore);
    dialog.append(heading, names, message, actions);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  } catch (error) { report(error); }
});
search.addEventListener('input', render);
await reload();
