import { openWorkspaceDatabase } from '../browser/database.js';
import type { GradientDocument, PaletteDocument } from '../browser/document.js';
import { createGradientEditing } from '../browser/editing.js';
import { workspaceRepository } from '../browser/repository.js';
import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { parseColor } from '../color/parse.js';
import { prepareGradient, type Gradient, type GradientStop } from '../gradient/gradient.js';
import { collectionText } from './collection-text.js';
import { readActiveDraft, readGradientDraft, storeActivePalette, storeGradientDraft } from './draft.js';
import { openExportDrawer } from './export-drawer.js';
import { gradientText } from './gradient-tools-text.js';
import { screenTitle } from './strings.js';
import { clientLocale, get, node, press } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof gradientText>[1]) => gradientText(locale, key);
const c = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
const studio = !!document.querySelector('[data-gradient-mode="gradient-studio"]');
const select = (id: string) => get<HTMLSelectElement>(id);
const input = (id: string) => get<HTMLInputElement>(id);
const text = get<HTMLTextAreaElement>('gr-css');
const preview = get('gr-preview');
const status = get('gr-status');
const initial: GradientDocument = readGradientDraft() ?? { kind: 'gradient', schemaVersion: 1, id: crypto.randomUUID(),
  name: screenTitle(locale, 'gradient-studio'), revision: 1, updatedAt: Date.now(), type: 'linear', angle: 90, interpolation: 'srgb',
  stops: ['#213C35', '#6F8F7B', '#E4B363'].map((color, index) => ({ id: 'stop-' + index, position: index / 2, color: parseColor(color) })) };
const api = createGradientEditing(initial);
const snapshot = () => api.snapshot().document;
const count = () => studio ? 5 : input('gr-count').valueAsNumber;
const percentages = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
function allowed(action: () => void) {
  try { action(); } catch { status.textContent = t('invalid'); }
}
function write(gradient: Gradient, redraw = true) {
  api.edit({ type: 'replace', gradient }, api.snapshot().version);
  render(redraw);
}

function drawStops(stops: readonly GradientStop[]) {
  const target = get('gr-stops');
  const previous = (document.activeElement as HTMLElement | null)?.dataset.stopFocus;
  target.replaceChildren(...stops.map((stop, index) => {
    const row = node('fieldset');
    row.dataset.stop = stop.id;
    row.append(node('legend', t('stop') + ' ' + (index + 1)));
    const fields = node('div', undefined, 'gradient-stop');
    const addField = (key: 'position' | 'color' | 'opacity', value: string, numeric: boolean) => {
      const label = node('label', t(key));
      const control = node('input');
      control.type = numeric ? 'number' : 'text';
      control.value = value;
      if (numeric) { control.min = '0'; control.max = '100'; control.step = 'any'; }
      control.dataset.stopFocus = stop.id + ':' + key;
      label.append(control);
      fields.append(label);
      return control;
    };
    const position = addField('position', String(stop.position * 100), true);
    const color = addField('color', colorCss(stop.color), false);
    const opacity = addField('opacity', String(stop.color.alpha * 100), true);
    const change = (fromColor: boolean) => allowed(() => {
      if (!position.validity.valid || !opacity.validity.valid) throw new RangeError('Invalid stop.');
      const parsed = parseColor(color.value);
      const next = { id: stop.id, position: position.valueAsNumber / 100,
        color: { ...parsed, alpha: fromColor ? parsed.alpha : opacity.valueAsNumber / 100 } };
      const current = snapshot();
      const updated = current.stops.map(stop => stop.id === next.id ? next : stop).sort((a, b) => a.position - b.position);
      const reordered = updated.some((stop, index) => stop.id !== current.stops[index]!.id);
      write({ ...current, stops: updated }, reordered);
      if (!reordered) {
        color.value = colorCss(next.color);
        opacity.value = String(next.color.alpha * 100);
      }
    });
    position.addEventListener('change', () => change(false));
    opacity.addEventListener('change', () => change(false));
    color.addEventListener('change', () => change(true));
    const remove = press(t('remove'), () => allowed(() => {
      const current = snapshot();
      write({ ...current, stops: current.stops.filter(item => item.id !== stop.id) });
      get('gr-add').focus();
    }));
    remove.disabled = stops.length <= 2;
    row.append(fields, remove);
    return row;
  }));
  if (previous) [...target.querySelectorAll<HTMLElement>('[data-stop-focus]')].find(el => el.dataset.stopFocus === previous)?.focus();
}

function render(redraw = true) {
  const current = snapshot();
  const css = api.css();
  preview.style.backgroundImage = css;
  text.value = css;
  select('gr-space').value = current.interpolation;
  select('gr-hue').value = current.huePath ?? 'shorter';
  select('gr-hue').disabled = current.interpolation !== 'oklch';
  if (studio) {
    select('gr-type').value = current.type;
    input('gr-angle').value = String(current.angle ?? (current.type === 'linear' ? 180 : 0));
    input('gr-center-x').value = String((current.center?.[0] ?? 0.5) * 100);
    input('gr-center-y').value = String((current.center?.[1] ?? 0.5) * 100);
    input('gr-angle').disabled = current.type === 'radial';
    input('gr-center-x').disabled = input('gr-center-y').disabled = current.type === 'linear';
    get<HTMLButtonElement>('gr-add').disabled = current.stops.length >= 12;
    if (redraw) drawStops(current.stops);
  } else {
    const swatches = api.sample(count());
    get('gr-samples').replaceChildren(...swatches.map(sample => {
      const item = node('li', undefined, 'image-color');
      const tile = node('span');
      const hex = toHex(sample.color).hex;
      tile.style.backgroundColor = colorCss(sample.color);
      item.append(tile, node('code', hex), node('p', percentages.format(sample.position)));
      return item;
    }));
  }
  status.textContent = storeGradientDraft(current) ? '' : c('storage');
}

function settings() {
  const current = snapshot();
  write({ ...current, type: studio ? select('gr-type').value as Gradient['type'] : current.type,
    interpolation: select('gr-space').value as Gradient['interpolation'], huePath: select('gr-hue').value as Gradient['huePath'],
    ...(studio ? { angle: input('gr-angle').valueAsNumber,
      center: [input('gr-center-x').valueAsNumber / 100, input('gr-center-y').valueAsNumber / 100] as const } : {}) });
}
for (const id of ['gr-space', 'gr-hue', ...(studio ? ['gr-type', 'gr-angle', 'gr-center-x', 'gr-center-y'] : [])]) {
  get(id).addEventListener('change', () => allowed(settings));
}
get('gr-reverse').addEventListener('click', () => allowed(() => {
  api.edit({ type: 'reverse' }, api.snapshot().version); render();
}));
get('gr-export').addEventListener('click', () => openExportDrawer(locale, snapshot()));
if (studio) {
  get('gr-add').addEventListener('click', () => allowed(() => {
    const current = snapshot();
    const stops = [...current.stops, { id: crypto.randomUUID(), position: 0.5, color: prepareGradient(current)(0.5) }]
      .sort((a, b) => a.position - b.position);
    write({ ...current, stops });
  }));
  const save = get<HTMLButtonElement>('gr-save');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const db = await openWorkspaceDatabase();
      try {
        await workspaceRepository(db).saveDocument({ ...snapshot(), id: crypto.randomUUID() }, { expectedRevision: null, updatedAt: Date.now() });
        status.textContent = t('saved');
      } finally { db.close(); }
    } catch { status.textContent = c('storage'); }
    finally { save.disabled = false; }
  });
} else {
  input('gr-count').addEventListener('change', () => allowed(() => render()));
  get('gr-use').addEventListener('click', () => allowed(() => {
    const current = readActiveDraft();
    if (current && current.saved?.editRevision !== current.document.revision && !confirm(c('confirmOpen'))) return;
    const next: PaletteDocument = { kind: 'palette', schemaVersion: 1, revision: 1, id: crypto.randomUUID(),
      name: snapshot().name, updatedAt: Date.now(), palette: { roles: {}, swatches: api.sample(count()).map((sample, index) =>
        ({ id: 'step-' + index, color: sample.color, locked: false })) } };
    if (storeActivePalette(next)) location.href = '/' + locale + '/palette-studio';
    else status.textContent = c('storage');
  }));
}
render();
