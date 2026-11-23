import { createBrowserMedia } from '../browser/media.js';
import { checkContrast } from '../color/contrast.js';
import { toHex } from '../color/convert.js';
import { colorCss } from '../color/css.js';
import { parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import { builtInFamilies, exportTailwindScale, generateColorScale, inspectBuiltInScale, shades,
  type Shade, type TailwindVersion } from '../tailwind/scale.js';
import { collectionText } from './collection-text.js';
import { colorCode, colorInput, colorSelect } from './color-controls.js';
import { colorToolsText } from './color-tools-text.js';
import { readActivePalette } from './draft.js';
import { previewToolsText } from './preview-tools-text.js';
import { tailwindStudioText } from './tailwind-studio-text.js';
import { clientLocale, get, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof tailwindStudioText>[1]) => tailwindStudioText(locale, key);
const media = createBrowserMedia();
const input = (id: string) => get<HTMLInputElement>(id);
const select = (id: string) => get<HTMLSelectElement>(id);
const button = (id: string) => get<HTMLButtonElement>(id);
const listen = (id: string, event: string, action: () => void) => get(id).addEventListener(event, action);
const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const version = () => Number(select('tw-version').value) as TailwindVersion;
const anchor = () => Number(select('tw-anchor').value) as Shade;
const shadeChoice = select('tw-override');
const baseChoice = select('tw-base');
const baseColor = input('tw-base-color');
const overrideColor = input('tw-override-color');
const exportFormat = select('tw-format');
const output = get<HTMLTextAreaElement>('tw-output');
const status = get('preview-status');

const categories: Record<string, readonly string[]> = {
  warm: ['red', 'orange', 'amber', 'yellow'],
  greens: ['lime', 'green', 'emerald', 'teal', 'olive'],
  blues: ['cyan', 'sky', 'blue', 'indigo', 'mist'],
  purple: ['violet', 'purple', 'fuchsia', 'pink', 'rose', 'mauve'],
  neutrals: ['slate', 'gray', 'zinc', 'neutral', 'stone', 'taupe'],
};
const black = parseColor('#000');
const white = parseColor('#FFF');
const palette = readActivePalette()?.palette.swatches ?? ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF']
  .map((hex, index) => ({ id: 'preview-' + index, color: parseColor(hex) }));
const swatches = new Map(palette.map(({ id, color }) => [id, color]));

type StudioMode = 'browse' | 'generate';
type ScaleView = {
  name: string;
  codes: Record<Shade, string>;
  colors: Record<Shade, ColorValue>;
  tailwind?: ReturnType<typeof exportTailwindScale>;
};
type ExportFile = { text: string; filename: string; mime: string };

function scaleView(name: string, codes: Record<Shade, string>, tailwind?: ScaleView['tailwind']): ScaleView {
  const colors = Object.fromEntries(shades.map(shade => [shade, parseColor(codes[shade])])) as Record<Shade, ColorValue>;
  return { name, codes, colors, tailwind };
}

let mode: StudioMode = 'browse';
const defaultFamily = 'red';
let family = defaultFamily;
let suggestedName = 'kitchen';
let view: ScaleView | undefined;
let generated: ScaleView | undefined;
let exportFile: ExportFile | undefined;
const picked: Record<StudioMode, Shade> = { browse: 500, generate: 500 };
const overrides: Partial<Record<Shade, ColorValue>> = {};

for (const [id, color] of swatches) baseChoice.add(new Option(colorCode(color), id));
baseChoice.value = palette[0]!.id;
baseColor.value = colorCode(palette[0]!.color);
const refreshBaseColor = colorInput(baseColor);
const basePicker = colorSelect(baseChoice, id => swatches.get(id));
const refreshOverrideColor = colorInput(overrideColor);
const overridePicker = colorSelect(shadeChoice, key => generated?.colors[Number(key) as Shade]);

function showFamilies() {
  const query = input('tw-search').value.trim().toLowerCase();
  const category = select('tw-category').value;
  const names = builtInFamilies(version()).filter(name => name.includes(query) &&
    (category === 'all' || categories[category]?.includes(name)));
  if (names.length && !names.includes(family)) family = names[0]!;
  get('tw-empty').hidden = names.length > 0;
  get('tw-families').replaceChildren(...names.map(name => {
    const row = node('li');
    const control = node('button', undefined, 'tw-family');
    control.type = 'button';
    control.dataset.family = name;
    control.setAttribute('aria-pressed', String(family === name));
    const strip = node('span', undefined, 'tw-family-strip');
    strip.setAttribute('aria-hidden', 'true');
    const { colors } = inspectBuiltInScale(version(), name)!;
    for (const shade of [100, 300, 500, 700, 900] as const) {
      const sample = node('span');
      sample.style.backgroundColor = colors[shade];
      strip.append(sample);
    }
    control.append(node('span', name, 'tw-family-name'), strip);
    control.addEventListener('click', () => {
      get('tw-families').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      control.setAttribute('aria-pressed', 'true');
      family = name;
      render();
    });
    row.append(control);
    return row;
  }));
}

function renderBuiltIn() {
  const entry = inspectBuiltInScale(version(), family) ?? inspectBuiltInScale(version(), defaultFamily)!;
  return scaleView(entry.name, entry.colors);
}

function updateGenerated() {
  let base: ColorValue;
  try {
    base = parseColor(baseColor.value);
    baseColor.removeAttribute('aria-invalid');
  } catch {
    baseColor.setAttribute('aria-invalid', 'true');
    status.textContent = previewToolsText(locale, 'unavailable');
    return undefined;
  }
  const pinned = anchor();
  const edits = { ...overrides };
  delete edits[pinned];
  const nameField = input('tw-name');
  try {
    const scale = generateColorScale({ name: nameField.value, base, anchor: pinned, overrides: edits });
    const activeVersion = version();
    const exported = exportTailwindScale(scale, { version: activeVersion, space: activeVersion === 3 ? 'srgb' : 'oklch' });
    nameField.removeAttribute('aria-invalid');
    if (exported.gamutMapped.length) status.textContent = t('gamut');
    return scaleView(scale.name, exported.colors, exported);
  } catch {
    nameField.setAttribute('aria-invalid', 'true');
    status.textContent = t('invalidName');
    return undefined;
  }
}

function renderScale(scale: ScaleView) {
  get('tw-title').textContent = scale.name;
  get('tw-scale').replaceChildren(...shades.map(shade => {
    const control = node('button', undefined, 'tailwind-shade');
    control.type = 'button';
    control.dataset.shade = String(shade);
    const tile = node('span', undefined, 'tw-tile');
    tile.setAttribute('aria-hidden', 'true');
    tile.style.backgroundColor = scale.codes[shade];
    control.append(tile, node('span', String(shade)), node('code', toHex(scale.colors[shade]).hex));
    control.addEventListener('click', () => {
      picked[mode] = shade;
      status.textContent = '';
      renderSelection();
      renderExamples();
    });
    return control;
  }));
  renderSelection();
}

function renderSelection() {
  if (!view) return;
  const shade = picked[mode];
  for (const control of get('tw-scale').querySelectorAll<HTMLButtonElement>('button')) {
    control.setAttribute('aria-pressed', String(Number(control.dataset.shade) === shade));
  }
  const token = view.name + '-' + shade;
  get('tw-shade-title').textContent = token;
  const css = view.codes[shade];
  const swatch = get('tw-swatch');
  swatch.style.backgroundColor = css;
  input('tw-value').value = css;
  input('tw-class').value = select('tw-utility').value + '-' + token;
  get<HTMLAnchorElement>('tw-inspect').href = '/' + locale + '/color-inspector#color=' + encodeURIComponent(css);
}

function renderExamples() {
  if (!view) return;
  const { name, colors, codes } = view;
  const shade = picked[mode];
  const dark = select('tw-theme').value === 'dark';
  const surface = dark ? black : white;
  const label = dark ? white : black;
  const lightRatio = checkContrast(white, colors[shade], surface).ratio;
  const darkRatio = checkContrast(black, colors[shade], surface).ratio;
  const ink = lightRatio >= darkRatio ? 'white' : 'black';
  const flat = node('span', t('next'), 'tw-example-button');
  flat.style.backgroundColor = codes[shade];
  flat.style.color = ink;
  const tint = dark ? 900 : 100;
  const accent = dark ? 100 : 900;
  const badge = node('span', t('ready'), 'tw-example-badge');
  badge.style.backgroundColor = codes[tint];
  badge.style.color = codes[accent];
  const field = node('span', t('email'), 'tw-example-field');
  field.style.borderColor = codes[shade];
  const sample = (title: string, graphic: HTMLElement, utilities: string, ratio?: number) => {
    const card = node('div', undefined, 'tw-example');
    const frame = node('div', undefined, 'tw-example-frame');
    frame.style.backgroundColor = colorCss(surface);
    frame.style.color = colorCss(label);
    frame.append(graphic);
    card.append(node('h3', title), frame, node('code', utilities));
    if (ratio !== undefined) {
      const measurement = checkContrastText(ratio);
      card.append(measurement);
    }
    return card;
  };
  get('tw-examples').replaceChildren(
    sample(t('button'), flat, `bg-${name}-${shade} text-${ink}`, Math.max(lightRatio, darkRatio)),
    sample(t('badge'), badge, `bg-${name}-${tint} text-${name}-${accent}`,
      checkContrast(colors[accent], colors[tint], surface).ratio),
    sample(t('field'), field, `border-${name}-${shade}`),
  );
}

function checkContrastText(ratio: number) {
  const passes = ratio >= 4.5;
  const result = node('p', format.format(ratio) + ' : 1 · AA ' + colorToolsText(locale, passes ? 'pass' : 'fail'), 'tw-aa');
  result.dataset.passes = String(passes);
  return result;
}

function renderExport() {
  get('tw-export-status').textContent = '';
  exportFile = undefined;
  if (!view) { output.value = ''; return; }
  const { name, codes, tailwind } = view;
  exportFormat.options[0]!.hidden = !tailwind;
  exportFormat.options[0]!.disabled = !tailwind;
  if (exportFormat.value === 'tailwind' && !tailwind) exportFormat.value = 'css';
  if (tailwind) exportFormat.options[0]!.text = tailwind.version === 4 ? 'Tailwind @theme' : 'Tailwind config';
  if (exportFormat.value === 'json') {
    exportFile = { text: JSON.stringify({ [name]: codes }, null, 2), filename: name + '.json', mime: 'application/json' };
  } else if (exportFormat.value === 'tailwind' && tailwind) {
    exportFile = tailwind.version === 4 ? { text: tailwind.css, filename: 'theme.css', mime: 'text/css' } :
      { text: tailwind.source, filename: 'tailwind.config.cjs', mime: 'text/javascript' };
  } else {
    const lines = shades.map(shade => `  --color-${name}-${shade}: ${codes[shade]};`);
    exportFile = { text: [':root {', ...lines, '}'].join('\n'), filename: name + '.css', mime: 'text/css' };
  }
  output.value = exportFile.text;
}

function render() {
  status.textContent = '';
  if (mode === 'generate') {
    generated = updateGenerated();
    for (const option of shadeChoice.options) {
      const key = option.value;
      option.text = generated ? key + ' · ' + toHex(generated.colors[Number(key) as Shade]).hex : key;
    }
    overridePicker.refresh();
    view = generated;
  } else {
    view = renderBuiltIn();
  }
  for (const id of ['tw-details', 'tw-usage', 'tw-export']) get(id).hidden = !view;
  if (view) {
    renderScale(view);
    renderExamples();
  }
  renderExport();
}

function showMode(next: StudioMode) {
  mode = next;
  for (const choice of ['browse', 'generate'] as const) button('tw-' + choice).setAttribute('aria-pressed', String(choice === mode));
  get('tw-library').hidden = mode !== 'browse';
  get('tw-editor').hidden = mode !== 'generate';
  button('tw-from-shade').hidden = mode !== 'browse';
  exportFormat.value = mode === 'generate' ? 'tailwind' : 'css';
  render();
}

function refreshLibrary() {
  showFamilies();
  if (mode === 'browse') render();
}

function showOverride() {
  const color = overrides[Number(shadeChoice.value) as Shade];
  overrideColor.value = color ? colorCode(color) : '';
  refreshOverrideColor();
}

async function copy(field: HTMLInputElement | HTMLTextAreaElement, feedback = status) {
  const result = await media.files.copyText(field.value);
  feedback.textContent = collectionText(locale, result.copied ? 'copied' : 'select');
  if (!result.copied) { field.focus(); field.select(); }
}

listen('tw-browse', 'click', () => showMode('browse'));
listen('tw-generate', 'click', () => showMode('generate'));
listen('tw-search', 'input', refreshLibrary);
listen('tw-category', 'change', refreshLibrary);
listen('tw-version', 'change', () => { showFamilies(); render(); });
listen('tw-theme', 'change', renderExamples);
listen('tw-utility', 'change', renderSelection);
listen('tw-format', 'change', renderExport);
listen('tw-copy-value', 'click', () => { void copy(input('tw-value')); });
listen('tw-copy-class', 'click', () => { void copy(input('tw-class')); });
listen('tw-copy', 'click', () => { void copy(output, get('tw-export-status')); });
listen('tw-download', 'click', () => {
  if (exportFile) media.files.download(new Blob([exportFile.text], { type: exportFile.mime }), exportFile.filename);
});
listen('tw-from-shade', 'click', () => {
  if (!view) return;
  const shade = picked.browse;
  const name = input('tw-name');
  if (name.value === suggestedName) {
    suggestedName = view.name + '-custom';
    name.value = suggestedName;
  }
  baseChoice.value = '';
  baseColor.value = view.codes[shade];
  select('tw-anchor').value = String(shade);
  picked.generate = shade;
  basePicker.refresh();
  refreshBaseColor();
  showMode('generate');
  name.focus();
});
listen('tw-name', 'change', render);
listen('tw-anchor', 'change', () => { picked.generate = anchor(); render(); });
baseChoice.addEventListener('change', () => {
  const color = swatches.get(baseChoice.value);
  if (color) {
    baseColor.value = colorCode(color);
    refreshBaseColor();
    render();
  } else baseColor.focus();
});
baseColor.addEventListener('input', () => {
  baseChoice.value = '';
  basePicker.refresh();
});
baseColor.addEventListener('change', render);
shadeChoice.addEventListener('change', showOverride);
listen('tw-apply', 'click', () => {
  const shade = Number(shadeChoice.value) as Shade;
  try {
    if (shade === anchor()) throw new RangeError('Cannot override a pinned shade.');
    overrides[shade] = parseColor(overrideColor.value);
    picked.generate = shade;
    render();
  } catch {
    status.textContent = previewToolsText(locale, 'unavailable');
  }
});
listen('tw-clear', 'click', () => {
  delete overrides[Number(shadeChoice.value) as Shade];
  showOverride();
  render();
});

showFamilies();
showMode('browse');
