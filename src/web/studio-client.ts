import { openWorkspaceDatabase, WorkspaceStorageError } from '../browser/database.js';
import type { PaletteDocument } from '../browser/document.js';
import { colorTools, createPaletteEditing, EditingError } from '../browser/editing.js';
import { createBrowserMedia } from '../browser/media.js';
import { workspaceRepository } from '../browser/repository.js';
import { harmonyModes, type Harmony } from '../color/effects.js';
import { messages } from '../i18n/messages.js';
import type { ColorValue, Swatch } from '../model/color.js';
import { isLocale } from '../model/locales.js';
import type { PaletteCommand } from '../palette/document.js';
import { maxSwatches, minSwatches, type Temperature } from '../palette/generate.js';
import { readActiveDraft, storeActivePalette } from './draft.js';
import { webText } from './strings.js';
import { studioRoles, studioText } from './studio-text.js';

const locale = isLocale(document.documentElement.lang) ? document.documentElement.lang : 'en';
const t = (key: Parameters<typeof studioText>[1]) => studioText(locale, key);
const paletteName = webText(locale, 'artwork');
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => get<HTMLInputElement>(id);
const select = (id: string) => get<HTMLSelectElement>(id);
const button = (id: string) => get<HTMLButtonElement>(id);
const canvas = get<HTMLElement>('palette-canvas');
const list = get<HTMLOListElement>('studio-swatches');
const name = input('palette-name');
const harmony = select('palette-harmony');
const temperature = select('palette-temperature');
const seed = input('palette-seed');
const shortcut = input('palette-shortcut');
const role = select('palette-role');
const roleColor = select('palette-role-color');
const adjustPreview = get('adjust-preview');
const undo = button('studio-undo');
const apply = button('studio-apply');
const copyFallback = get<HTMLLabelElement>('copy-fallback');
const status = get('studio-status');
const media = createBrowserMedia();
const settingsKey = 'ck-palette-studio-settings';
const initialDraft = readActiveDraft();
const initial: PaletteDocument = initialDraft?.document ?? {
  id: crypto.randomUUID(), kind: 'palette', schemaVersion: 1, revision: 1, name: paletteName, updatedAt: Date.now(),
  palette: { roles: {}, swatches: ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'].map((hex, index) =>
    ({ id: 'swatch-' + (index + 1), color: colorTools.inspect(hex).color, locked: false })) },
};
const unavailable = async (): Promise<never> => { throw new WorkspaceStorageError('unavailable', 'Local storage is unavailable.'); };
let repository: ReturnType<typeof workspaceRepository> | undefined;
try {
  const database = await openWorkspaceDatabase();
  repository = workspaceRepository(database);
} catch { /* Editing and download remain available in this document. */ }
const api = createPaletteEditing(repository ?? {
  getDocument: unavailable, saveDocument: unavailable, deleteDocument: unavailable, restoreDocument: unavailable,
}, initial, { now: Date.now, newId: () => crypto.randomUUID(), saved: initialDraft?.saved });
let proposed: ReturnType<typeof api.propose> | undefined;

function report(error: unknown) {
  const key = error instanceof EditingError ? error.messageId : 'editing.error.invalid';
  status.textContent = messages[locale][key];
}

function originalValue(color: ColorValue) {
  const inspected = colorTools.inspect(color);
  if (color.space === 'srgb' && [...color.components, color.alpha].every(channel =>
    Math.abs(Math.round(channel * 255) / 255 - channel) < 1e-12)) return inspected.hex.hex;
  return inspected.css;
}

function action(label: string, id: string, control: string, onClick: () => void) {
  const result = document.createElement('button');
  result.type = 'button';
  result.className = 'swatch-action';
  result.textContent = label;
  result.dataset.control = id + ':' + control;
  result.addEventListener('click', onClick);
  return result;
}

function resetPreview() {
  proposed = undefined;
  adjustPreview.hidden = true;
  apply.disabled = true;
}

function renderRoles(swatches: readonly Swatch[], roles: PaletteDocument['palette']['roles']) {
  roleColor.replaceChildren(new Option(t('none'), ''), ...swatches.map(({ id, color }, index) =>
    new Option(t('swatch') + ' ' + (index + 1) + ' · ' + colorTools.inspect(color).hex.hex, id)));
  roleColor.value = Object.hasOwn(roles, role.value) ? roles[role.value]! : '';
}

function sync(redraw = true) {
  const state = api.snapshot();
  const { document: current } = state;
  const swatches = current.palette.swatches;
  if (document.activeElement !== name) name.value = current.name;
  undo.disabled = !state.canUndo;
  button('studio-add').disabled = swatches.length >= maxSwatches;
  get('studio-count').textContent = t('count').replace('{count}', String(swatches.length));
  renderRoles(swatches, current.palette.roles);
  if (redraw) {
    const focus = (document.activeElement as HTMLElement | null)?.dataset.control;
    const open = new Set([...list.querySelectorAll<HTMLDetailsElement>('details[open]')].map(details => details.dataset.swatch));
    list.replaceChildren(...swatches.map((swatch, index) => card(swatch, index, swatches.length, open.has(swatch.id))));
    if (focus) {
      const active = [...list.querySelectorAll<HTMLElement>('[data-control]')].find(element =>
        element.dataset.control === focus && !(element instanceof HTMLButtonElement && element.disabled));
      (active ?? canvas).focus({ preventScroll: true });
    }
  }
  return storeActivePalette(current, state.saved);
}

function edit(command: Parameters<typeof api.edit>[0], announcement = '') {
  try {
    api.edit(command, api.snapshot().version);
    resetPreview();
    status.textContent = sync() ? announcement : messages[locale]['editing.error.storage'];
  } catch (error) { report(error); }
}

function card(swatch: Swatch, index: number, count: number, expanded: boolean) {
  const id = swatch.id;
  const title = t('swatch') + ' ' + (index + 1);
  const card = document.createElement('li');
  card.className = 'studio-swatch';
  card.dataset.swatchId = id;
  const sample = document.createElement('div');
  sample.className = 'studio-pigment';
  sample.style.backgroundColor = colorTools.inspect(swatch.color).css;
  const lock = action(swatch.locked ? t('locked') : t('lock'), id, 'lock',
    () => edit({ type: 'set-lock', id, locked: !swatch.locked }));
  lock.classList.add('swatch-lock');
  lock.setAttribute('aria-label', t('lock') + ' · ' + title);
  lock.setAttribute('aria-pressed', String(swatch.locked));
  const lockLabel = document.createElement('span');
  lockLabel.className = 'lock-label';
  lockLabel.textContent = lock.textContent;
  const lockIcon = document.createElement('span');
  lockIcon.className = 'lock-icon';
  lockIcon.setAttribute('aria-hidden', 'true');
  lock.replaceChildren(lockLabel, lockIcon);
  sample.append(lock);

  const values = document.createElement('div');
  values.className = 'swatch-fields';
  const label = document.createElement('label');
  label.textContent = title;
  const color = document.createElement('input');
  color.type = 'text';
  color.value = originalValue(swatch.color);
  color.readOnly = swatch.locked;
  color.maxLength = 160;
  color.spellcheck = false;
  color.autocomplete = 'off';
  color.dataset.control = id + ':value';
  label.append(color);
  color.addEventListener('change', () => {
    try {
      const next = colorTools.inspect(color.value);
      api.edit({ type: 'set-color', id, color: next.color }, api.snapshot().version);
      color.value = originalValue(next.color);
      sample.style.backgroundColor = next.css;
      color.removeAttribute('aria-invalid');
      resetPreview();
      status.textContent = sync(false) ? '' : messages[locale]['editing.error.storage'];
    } catch (error) {
      color.setAttribute('aria-invalid', 'true');
      report(error);
    }
  });
  values.append(label, action(t('copy'), id, 'copy', () => {
    const current = api.snapshot().document.palette.swatches.find(value => value.id === id);
    if (!current) return;
    void media.files.copyText(originalValue(current.color)).then(result => {
      copyFallback.hidden = result.copied;
      if (result.copied) status.textContent = t('copied');
      else {
        const field = input('copy-value');
        field.value = result.text;
        field.focus();
        field.select();
        status.textContent = t('copyFallback');
      }
    });
  }));

  const tools = document.createElement('details');
  tools.className = 'swatch-tools';
  tools.dataset.swatch = id;
  tools.open = expanded;
  const summary = document.createElement('summary');
  summary.textContent = t('swatchOptions');
  summary.dataset.control = id + ':options';
  const controls = document.createElement('div');
  const earlier = action(t('moveEarlier'), id, 'earlier', () => edit({ type: 'move', id, index: index - 1 }));
  earlier.disabled = index === 0;
  const later = action(t('moveLater'), id, 'later', () => edit({ type: 'move', id, index: index + 1 }));
  later.disabled = index === count - 1;
  const remove = action(t('remove'), id, 'remove', () => {
    const roles = Object.entries(api.snapshot().document.palette.roles).filter(([, value]) => value === id);
    if (roles.length && !window.confirm(t('confirmRemove'))) return;
    edit({ type: 'remove', id, roles: Object.fromEntries(roles.map(([key]) => [key, null])) });
  });
  remove.disabled = count <= minSwatches;
  controls.append(earlier, later, remove);
  tools.append(summary, controls);
  values.append(tools);
  card.append(sample, values);
  return card;
}

function generate() {
  const view = api.snapshot();
  if (view.document.palette.swatches.every(swatch => swatch.locked)) {
    status.textContent = t('allLocked');
    return;
  }
  try {
    if (!seed.validity.valid) throw new EditingError('invalid');
    const value = seed.value ? Number(seed.value) : crypto.getRandomValues(new Uint32Array(1))[0]!;
    const next = api.propose({ type: 'generate', options: {
      seed: value, harmony: harmony.value as Harmony, temperature: temperature.value as Temperature,
    } }, view.version);
    api.apply(next);
    resetPreview();
    status.textContent = sync() ? t('generated') : messages[locale]['editing.error.storage'];
  } catch (error) { report(error); }
}

function storeSettings() {
  try { sessionStorage.setItem(settingsKey, JSON.stringify({
    shortcut: shortcut.checked, harmony: harmony.value, temperature: temperature.value, seed: seed.value,
  })); } catch { /* The controls still work in the current page. */ }
  if (shortcut.checked) canvas.setAttribute('aria-keyshortcuts', 'Space');
  else canvas.removeAttribute('aria-keyshortcuts');
}
try {
  const settings = JSON.parse(sessionStorage.getItem(settingsKey) ?? '{}');
  if (typeof settings.shortcut === 'boolean') shortcut.checked = settings.shortcut;
  if (harmonyModes.includes(settings.harmony)) harmony.value = settings.harmony;
  if (['any', 'warm', 'cool'].includes(settings.temperature)) temperature.value = settings.temperature;
  if (typeof settings.seed === 'string' && /^\d{1,10}$/.test(settings.seed)) seed.value = settings.seed;
} catch { /* Use the visible defaults. */ }
for (const control of [shortcut, harmony, temperature, seed]) control.addEventListener('change', storeSettings);
storeSettings();
name.value = initial.name;
name.addEventListener('change', () => {
  try {
    api.rename(name.value, api.snapshot().version);
    name.value = api.snapshot().document.name;
    name.removeAttribute('aria-invalid');
    resetPreview();
    status.textContent = sync(false) ? '' : messages[locale]['editing.error.storage'];
  } catch (error) {
    name.setAttribute('aria-invalid', 'true');
    report(error);
  }
});
button('studio-generate').addEventListener('click', generate);
canvas.addEventListener('keydown', event => {
  if (event.target !== canvas || event.key !== ' ' || !shortcut.checked ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!event.repeat) generate();
});
undo.addEventListener('click', () => edit({ type: 'undo' }, t('restored')));
button('studio-add').addEventListener('click', () => {
  const fresh = colorTools.newPalette({ seed: crypto.getRandomValues(new Uint32Array(1))[0]! }, 2).swatches[0]!;
  const command: PaletteCommand = { type: 'add', id: crypto.randomUUID(), color: fresh.color };
  edit(command);
});
role.addEventListener('change', () => {
  const { palette } = api.snapshot().document;
  renderRoles(palette.swatches, palette.roles);
});
roleColor.addEventListener('change', () => {
  if (!studioRoles.some(value => value === role.value)) return;
  edit({ type: 'assign-role', role: role.value, id: roleColor.value || null });
});
const lightness = input('palette-lightness');
const chroma = input('palette-chroma');
for (const slider of [lightness, chroma]) slider.addEventListener('input', resetPreview);
button('studio-preview').addEventListener('click', () => {
  try {
    proposed = api.propose({ type: 'adjust', lightness: lightness.valueAsNumber, chroma: chroma.valueAsNumber },
      api.snapshot().version);
    adjustPreview.replaceChildren(...proposed.preview.swatches.map(({ color }) => {
      const tile = document.createElement('span');
      const inspected = colorTools.inspect(color);
      tile.style.backgroundColor = inspected.css;
      tile.title = inspected.hex.hex;
      return tile;
    }));
    adjustPreview.hidden = false;
    apply.disabled = false;
  } catch (error) { report(error); }
});
apply.addEventListener('click', () => {
  if (!proposed) return;
  try {
    api.apply(proposed);
    resetPreview();
    status.textContent = sync() ? t('generated') : messages[locale]['editing.error.storage'];
  } catch (error) { report(error); }
});
const save = button('studio-save');
save.addEventListener('click', async () => {
  save.disabled = true;
  try {
    await api.save();
    sync(false);
    status.textContent = t('saved');
  } catch (error) { report(error); }
  finally { save.disabled = false; }
});
button('studio-backup').addEventListener('click', () => {
  const value = api.snapshot().document;
  media.files.download(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), 'color-kitchen-palette.json');
});
if (!sync() || !repository) status.textContent = messages[locale]['editing.error.storage'];
