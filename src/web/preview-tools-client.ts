import { createBrowserMedia } from '../browser/media.js';
import { colorCss } from '../color/css.js';
import { parseColor } from '../color/parse.js';
import type { Palette } from '../model/color.js';
import { composePreview, previewDefaultColors, type PreviewRole, type PreviewVariant, type Template } from '../preview/layout.js';
import { collectionText } from './collection-text.js';
import { colorToolsText } from './color-tools-text.js';
import { colorCode, colorSelect, colorToken } from './color-controls.js';
import { readActivePalette } from './draft.js';
import { previewToolsText } from './preview-tools-text.js';
import { clientLocale, get, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof previewToolsText>[1]) => previewToolsText(locale, key);
const media = createBrowserMedia();
const status = get('preview-status');
const select = (id: string) => get<HTMLSelectElement>(id);
const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const palette: Palette = readActivePalette()?.palette ?? { roles: {},
  swatches: ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'].map((hex, index) =>
    ({ id: 'preview-' + index, locked: false, color: parseColor(hex) })) };
const swatches = new Map(palette.swatches.map(({ id, color }) => [id, color]));
function addSwatches(target: HTMLSelectElement) {
  for (const [id, color] of swatches) target.add(new Option(colorCode(color), id));
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
  let defaults = previewDefaultColors(variant().theme);
  let inspected = '';
  const pickers = mappings.map(field => {
    const role = field.dataset.previewRole as PreviewRole;
    field.add(new Option(t('default') + ' · ' + colorCode(defaults[role]), ''));
    addSwatches(field);
    field.value = Object.hasOwn(palette.roles, role) ? palette.roles[role]! : '';
    const picker = colorSelect(field, id => id ? swatches.get(id) : defaults[role]);
    field.addEventListener('change', render);
    return { field, role, picker };
  });
  function render() {
    defaults = previewDefaultColors(variant().theme);
    for (const { field, role, picker } of pickers) {
      field.options[0]!.text = t('default') + ' · ' + colorCode(defaults[role]);
      picker.refresh();
    }
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
    const samples = node('p', undefined, 'color-pair');
    samples.append(colorToken(pair.foreground), ' / ', colorToken(pair.background),
      ' · ' + format.format(pair.ratio) + ' : 1 · AA ' + colorToolsText(locale, pair.normal.aa.passes ? 'pass' : 'fail'));
    description.replaceChildren(node('strong', block.label ?? ''), samples);
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

mountPreview();
