'use strict';

const samples = [
  ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'],
  ['#213C35', '#788F96', '#D49B70', '#E2D2C2', '#F5F1E9'],
  ['#324B3F', '#697C63', '#CFAC6E', '#E4D8BD', '#F9F6ED'],
  ['#303C53', '#7F9A83', '#DDA46C', '#E5DDCF', '#F6F4EE'],
];

const byId = id => document.getElementById(id);
const screenSelect = byId('screen-select');
const palettePanel = byId('palette-panel');
const referencePanel = byId('reference');
const panels = {
  '02': palettePanel,
  '05': byId('contrast-panel'),
  '18': byId('export-panel'),
  '19': palettePanel,
  '20': byId('preferences-panel'),
};
const allPanels = new Set([referencePanel, ...Object.values(panels)]);
const toolLinks = document.querySelectorAll('.tool-links a');
const status = byId('workspace-status');

function showScreen() {
  const requested = location.hash.slice(1);
  if (requested === 'main-content') return;

  screenSelect.value = requested;
  if (!screenSelect.value) screenSelect.value = '01';

  const screen = screenSelect.value;
  const option = screenSelect.selectedOptions[0];
  const title = option.textContent.slice(3);
  const panel = panels[screen] || referencePanel;
  const focused = document.activeElement;
  const focusMoves = [...allPanels].some(other => other !== panel && other.contains(focused));
  const heading = panel.querySelector('h1');

  heading.textContent = title;
  palettePanel.classList.toggle('mobile-reference', screen === '19');
  if (panel === referencePanel) {
    const image = byId('reference-image');
    image.src = 'mockups/public-and-browser/' + option.dataset.image;
    image.alt = 'Color Kitchen mockup for ' + title;
    byId('reference-link').href = 'Color_Kitchen_Screen_Gallery.html#s' + screen;
  }
  for (const other of allPanels) other.hidden = other !== panel;
  for (const link of toolLinks) {
    const current = link.hash === '#' + (screen === '19' ? '02' : screen);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = title + ' | Color Kitchen prototype';
  status.textContent = '';
  if (focusMoves) heading.focus();
}

screenSelect.addEventListener('change', () => { location.hash = screenSelect.value; });
window.addEventListener('hashchange', showScreen);

function normalizeHex(value) {
  const hex = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return '#' + [...hex.slice(1)].map(channel => channel + channel).join('');
  }
  return null;
}

async function copyText(field) {
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = 'Copied to clipboard.';
  } catch {
    field.focus();
    field.select();
    status.textContent = 'Use your browser’s Copy command to copy the selected text.';
  }
}

const palette = byId('palette');
const generate = byId('generate-palette');
const undo = byId('undo-palette');
const swatchTemplate = byId('swatch-template');
let colors = samples[0].map((hex, index) => ({ hex, locked: index === 0 }));
let sampleIndex = 0;
const history = [];

const swatches = colors.map((_, index) => {
  const card = swatchTemplate.content.firstElementChild.cloneNode(true);
  const label = card.querySelector('label');
  const field = card.querySelector('input');
  const error = card.querySelector('.swatch-error');
  const lock = card.querySelector('.lock');
  const copy = card.querySelector('.copy');
  const block = card.querySelector('.swatch-color');
  const name = 'Color ' + (index + 1);

  field.id = 'swatch-' + (index + 1);
  label.htmlFor = field.id;
  label.textContent = name;
  error.id = field.id + '-error';
  field.setAttribute('aria-describedby', error.id);
  copy.setAttribute('aria-label', 'Copy ' + name.toLowerCase());
  palette.append(card);

  function validateField() {
    const hex = normalizeHex(field.value);
    field.setAttribute('aria-invalid', String(!hex));
    error.textContent = hex ? '' : 'Enter a HEX color, such as #213C35.';
    copy.disabled = !hex;
    return hex;
  }

  function commitField() {
    const hex = validateField();
    if (!hex) return;
    if (hex === colors[index].hex) {
      field.value = hex;
      return;
    }
    rememberPalette();
    colors[index].hex = hex;
    renderPalette();
    status.textContent = name + ' updated.';
  }

  field.addEventListener('input', validateField);
  field.addEventListener('change', commitField);
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') commitField();
    if (event.key === 'Escape') {
      field.value = colors[index].hex;
      validateField();
    }
  });
  lock.addEventListener('click', () => {
    rememberPalette();
    colors[index].locked = !colors[index].locked;
    renderPalette();
    status.textContent = name + (colors[index].locked ? ' locked.' : ' unlocked.');
  });
  copy.addEventListener('click', () => { void copyText(field); });
  return { field, error, lock, copy, block, name };
});

function rememberPalette() {
  history.push({ colors: colors.map(color => ({ ...color })), sampleIndex });
  if (history.length > 30) history.shift();
}

generate.addEventListener('click', () => {
  rememberPalette();
  sampleIndex = (sampleIndex + 1) % samples.length;
  for (const [index, color] of colors.entries()) {
    if (!color.locked) color.hex = samples[sampleIndex][index];
  }
  renderPalette();
  status.textContent = 'Sample generated. Locked colors kept.';
});

undo.addEventListener('click', () => {
  const snapshot = history.pop();
  colors = snapshot.colors;
  sampleIndex = snapshot.sampleIndex;
  renderPalette();
  status.textContent = 'Previous palette restored.';
});

const foreground = byId('contrast-fg');
const background = byId('contrast-bg');
const foregroundSource = byId('foreground-source');
const backgroundSource = byId('background-source');
const contrastFeedback = byId('contrast-feedback');
const contrastResults = byId('contrast-results');
const contrastPreview = byId('contrast-preview');
const applyContrast = byId('apply-contrast');
const ratioValue = byId('ratio-value');
const checks = [
  [byId('normal-aa'), 4.5],
  [byId('normal-aaa'), 7],
  [byId('large-aa'), 3],
  [byId('large-aaa'), 4.5],
];

for (const source of [foregroundSource, backgroundSource]) {
  for (const index of colors.keys()) source.append(new Option('', String(index)));
  source.addEventListener('change', updateContrast);
}
for (const field of [foreground, background]) {
  field.addEventListener('input', updateContrast);
}

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function pairColor(field, source) {
  field.readOnly = source.value !== '';
  if (field.readOnly) field.value = colors[Number(source.value)].hex;
  const hex = normalizeHex(field.value);
  field.setAttribute('aria-invalid', String(!hex));
  return hex;
}

let suggestedForeground;

function updateContrast() {
  const fg = pairColor(foreground, foregroundSource);
  const bg = pairColor(background, backgroundSource);
  const valid = Boolean(fg && bg);
  contrastResults.hidden = !valid;
  contrastPreview.hidden = !valid;
  applyContrast.hidden = true;
  contrastFeedback.textContent = valid ? '' : 'Enter a valid HEX color in both fields.';
  if (!valid) return;

  const ratio = contrastRatio(fg, bg);
  ratioValue.textContent = ratio.toFixed(2) + ':1';
  contrastPreview.style.color = fg;
  contrastPreview.style.backgroundColor = bg;
  for (const [cell, threshold] of checks) {
    const passes = ratio >= threshold;
    cell.textContent = (passes ? 'Pass · ' : 'Fail · ') + threshold + ':1';
    cell.className = passes ? 'pass' : 'fail';
  }
  if (ratio < 4.5) {
    suggestedForeground = ['#3E6452', '#000000', '#FFFFFF'].find(hex => contrastRatio(hex, bg) >= 4.5);
    applyContrast.textContent = 'Use ' + suggestedForeground + ' as foreground';
    applyContrast.hidden = false;
  }
}

byId('swap-colors').addEventListener('click', () => {
  [foregroundSource.value, backgroundSource.value] = [backgroundSource.value, foregroundSource.value];
  [foreground.value, background.value] = [background.value, foreground.value];
  updateContrast();
});

applyContrast.addEventListener('click', () => {
  foregroundSource.value = '';
  foreground.value = suggestedForeground;
  updateContrast();
  status.textContent = 'Foreground updated for this comparison.';
  byId('contrast-fg').focus();
});

const exportSwatches = byId('export-swatches');
const cssOutput = byId('css-output');
const downloadCss = byId('download-css');
let cssUrl;

function renderExport() {
  exportSwatches.replaceChildren(...colors.map(({ hex }) => {
    const block = document.createElement('span');
    block.style.backgroundColor = hex;
    return block;
  }));
  const properties = colors.map(({ hex }, index) => '  --color-' + (index + 1) + ': ' + hex + ';');
  const css = [':root {', ...properties, '}', ''].join('\n');
  cssOutput.value = css;
  if (cssUrl) URL.revokeObjectURL(cssUrl);
  cssUrl = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
  downloadCss.href = cssUrl;
}

function renderPalette() {
  for (const [index, { hex, locked }] of colors.entries()) {
    const { field, error, lock, copy, block, name } = swatches[index];
    field.value = hex;
    field.readOnly = locked;
    field.setAttribute('aria-invalid', 'false');
    error.textContent = '';
    copy.disabled = false;
    lock.dataset.locked = String(locked);
    lock.setAttribute('aria-label', (locked ? 'Unlock ' : 'Lock ') + name.toLowerCase());
    lock.textContent = locked ? 'Unlock' : 'Lock';
    block.style.backgroundColor = hex;
    for (const source of [foregroundSource, backgroundSource]) {
      source.options[index + 1].textContent = name + ' · ' + hex;
    }
  }
  generate.disabled = colors.every(color => color.locked);
  byId('generation-hint').hidden = !generate.disabled;
  undo.disabled = history.length === 0;
  updateContrast();
  renderExport();
}

byId('copy-css').addEventListener('click', () => { void copyText(cssOutput); });

const preferencesForm = byId('preferences-form');
const preferenceFields = [...preferencesForm.querySelectorAll('input[type="checkbox"]')];
const preferenceStorageKey = 'color-kitchen-prototype-preferences-v1';

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceStorageKey));
    for (const field of preferenceFields) field.checked = saved?.[field.name] === true;
  } catch {
    for (const field of preferenceFields) field.checked = false;
  }
}

function savePreferences() {
  const preferences = Object.fromEntries(preferenceFields.map(field => [field.name, field.checked]));
  try {
    localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences));
    status.textContent = 'Demo preferences saved on this device.';
  } catch {
    status.textContent = 'Browser storage is unavailable. Demo choices are kept until this page closes.';
  }
}

preferencesForm.addEventListener('submit', event => {
  event.preventDefault();
  savePreferences();
});
for (const [id, checked] of [['accept-optional', true], ['reject-optional', false]]) {
  byId(id).addEventListener('click', () => {
    for (const field of preferenceFields) field.checked = checked;
    savePreferences();
  });
}

loadPreferences();
renderPalette();
showScreen();
