import { colorTools } from '../browser/editing.js';
import { createBrowserMedia } from '../browser/media.js';
import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { parseColor } from '../color/parse.js';
import type { ColorValue, Palette } from '../model/color.js';
import { composePreview, type PreviewVariant, type Template } from '../preview/layout.js';
import { shades, type Shade, type TailwindVersion } from '../tailwind/scale.js';
import { collectionText } from './collection-text.js';
import { colorToolsText } from './color-tools-text.js';
import { readActivePalette } from './draft.js';
import { previewToolsText } from './preview-tools-text.js';
import { clientLocale, get, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof previewToolsText>[1]) => previewToolsText(locale, key);
const media = createBrowserMedia();
const status = get('preview-status');
const select = (id: string) => get<HTMLSelectElement>(id);
const input = (id: string) => get<HTMLInputElement>(id);
const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const palette: Palette = readActivePalette()?.palette ?? { roles: {},
  swatches: ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'].map((hex, index) =>
    ({ id: 'preview-' + index, locked: false, color: parseColor(hex) })) };
function addSwatches(target: HTMLSelectElement) {
  for (const swatch of palette.swatches) target.add(new Option(toHex(swatch.color).hex, swatch.id));
}
function listen(id: string, event: string, action: () => void) { get(id).addEventListener(event, action); }
function textFile(text: string, filename: string, mime: string) {
  media.files.download(new Blob([text], { type: mime }), filename);
}

function mountPreview() {
  const canvas = get('template-canvas');
  const description = get('preview-pair');
  const mappings = [...document.querySelectorAll<HTMLSelectElement>('[data-preview-role]')];
  const template = () => select('preview-template').value as Template;
  const variant = () => ({ theme: select('preview-theme').value as PreviewVariant['theme'],
    viewport: select('preview-size').value as PreviewVariant['viewport'] });
  const mapped = () => ({ ...palette, roles: Object.fromEntries(mappings.filter(select => select.value)
    .map(select => [select.dataset.previewRole!, select.value])) });
  let inspected = '';
  for (const field of mappings) {
    field.add(new Option(t('default'), ''));
    addSwatches(field);
    const role = field.dataset.previewRole!;
    field.value = Object.hasOwn(palette.roles, role) ? palette.roles[role]! : '';
    field.addEventListener('change', render);
  }
  function render() {
    const plan = composePreview(template(), variant(), mapped());
    canvas.style.aspectRatio = plan.width + ' / ' + plan.height;
    canvas.style.maxWidth = plan.width + 'px';
    canvas.style.backgroundColor = colorCss(plan.background);
    canvas.dataset.viewport = variant().viewport;
    canvas.replaceChildren(...plan.blocks.map(block => {
      const item = block.pair ? node('button', block.label ?? '', 'template-block') : node('div', undefined, 'template-block');
      item.dataset.block = block.id;
      if (item instanceof HTMLButtonElement) {
        item.type = 'button';
        item.setAttribute('aria-label', t('pairs') + ' · ' + block.label);
        item.addEventListener('click', () => {
          inspected = block.id;
          showPair(block);
        });
      }
      const { x, y, width, height } = block.rect;
      item.style.left = x / plan.width * 100 + '%';
      item.style.top = y / plan.height * 100 + '%';
      item.style.width = width / plan.width * 100 + '%';
      item.style.height = height / plan.height * 100 + '%';
      item.style.backgroundColor = colorCss(block.fill);
      if (block.ink) item.style.color = colorCss(block.ink);
      return item;
    }));
    showPair(plan.blocks.find(block => block.id === inspected && block.pair) ?? plan.blocks.find(block => block.pair));
    return plan;
  }
  function showPair(block?: ReturnType<typeof composePreview>['blocks'][number]) {
    if (!block?.pair) { description.replaceChildren(); return; }
    const { pair } = block;
    description.replaceChildren(node('strong', block.label ?? ''), node('p',
      toHex(pair.foreground).hex + ' / ' + toHex(pair.background).hex + ' · ' + format.format(pair.ratio) + ' : 1 · AA ' +
        colorToolsText(locale, pair.normal.aa.passes ? 'pass' : 'fail')));
  }
  for (const id of ['preview-template', 'preview-theme', 'preview-size']) listen(id, 'change', render);
  listen('preview-reset', 'click', () => { for (const field of mappings) field.value = ''; render(); });
  listen('preview-tokens', 'click', () => {
    const tokens = Object.fromEntries(Object.entries(render().roles).map(([role, color]) => [role, colorCss(color)]));
    textFile(JSON.stringify(tokens, null, 2), 'color-kitchen-roles.json', 'application/json');
  });
  let controller: AbortController | undefined;
  get('preview-export').addEventListener('click', async () => {
    controller?.abort();
    const run = new AbortController();
    controller = run;
    try {
      const output = await media.export.designPreview({ kind: 'design-preview', template: template(),
        variant: variant(), palette: mapped() }, run.signal).result;
      if (!run.signal.aborted) { media.files.download(output.blob, 'color-kitchen-preview.png'); status.textContent = ''; }
    } catch { if (!run.signal.aborted) status.textContent = collectionText(locale, 'invalid'); }
  });
  render();
}

function mountTailwind() {
  const base = select('tw-base');
  const shade = select('tw-override');
  const colorField = input('tw-override-color');
  const output = get<HTMLTextAreaElement>('tw-output');
  const version = () => Number(select('tw-version').value) as TailwindVersion;
  const anchor = () => Number(select('tw-anchor').value) as Shade;
  const overrides: Partial<Record<Shade, ColorValue>> = {};
  addSwatches(base);
  function render() {
    try {
      const color = palette.swatches.find(item => item.id === base.value)!.color;
      const pinned = anchor();
      const edits = { ...overrides };
      delete edits[pinned];
      const scale = colorTools.tailwind.generate({ base: color, name: input('tw-name').value, anchor: pinned, overrides: edits });
      const activeVersion = version();
      const exported = media.export.tailwindText(scale, { version: activeVersion, space: activeVersion === 3 ? 'srgb' : 'oklch' });
      output.value = exported.text;
      status.textContent = exported.gamutMapped.length ? collectionText(locale, 'gamut') : '';
      const strips = shades.map(shade => {
        const item = node('div', undefined, 'tailwind-shade');
        item.dataset.shade = String(shade);
        const tile = node('span');
        tile.style.backgroundColor = colorCss(scale.colors[shade]);
        item.append(tile, node('span', String(shade)), node('code', toHex(scale.colors[shade]).hex));
        return item;
      });
      get('tw-scale').replaceChildren(...strips);
      const fg = scale.colors[900];
      const bg = scale.colors[100];
      const result = colorTools.tailwind.contrast(scale, 900, 100, parseColor('#FFF'));
      const sample = node('p', t('sample') + ' · ' + format.format(result.ratio) + ' : 1', 'tailwind-sample');
      sample.style.backgroundColor = colorCss(bg);
      sample.style.color = colorCss(fg);
      get('tw-sample').replaceChildren(sample);
      const family = select('tw-built').value;
      const built = family ? colorTools.tailwind.inspect(activeVersion, family) : null;
      get('tw-built-result').textContent = built ? built.name + ' · v' + built.version + ' · 500 ' + built.colors[500] : '';
      get<HTMLButtonElement>('tw-download').disabled = get<HTMLButtonElement>('tw-copy').disabled = false;
    } catch {
      output.value = '';
      status.textContent = t('unavailable');
      get<HTMLButtonElement>('tw-download').disabled = get<HTMLButtonElement>('tw-copy').disabled = true;
    }
  }
  for (const id of ['tw-version', 'tw-name', 'tw-base', 'tw-anchor', 'tw-built']) listen(id, 'change', render);
  shade.addEventListener('change', () => {
    const color = overrides[Number(shade.value) as Shade];
    colorField.value = color ? colorCss(color) : '';
  });
  listen('tw-apply', 'click', () => {
    try {
      const key = Number(shade.value) as Shade;
      if (key === anchor()) throw new RangeError('Cannot override a pinned shade.');
      overrides[key] = parseColor(colorField.value);
      render();
    } catch { status.textContent = t('unavailable'); }
  });
  listen('tw-clear', 'click', () => { delete overrides[Number(shade.value) as Shade]; colorField.value = ''; render(); });
  listen('tw-download', 'click', () => {
    if (output.value) textFile(output.value, version() === 3 ? 'tailwind.config.cjs' : 'theme.css',
      version() === 3 ? 'text/javascript' : 'text/css');
  });
  get('tw-copy').addEventListener('click', async () => {
    const result = await media.files.copyText(output.value);
    status.textContent = collectionText(locale, result.copied ? 'copied' : 'select');
    if (!result.copied) { output.focus(); output.select(); }
  });
  render();
}

if (document.querySelector('[data-preview-mode="design-preview"]')) mountPreview(); else mountTailwind();
