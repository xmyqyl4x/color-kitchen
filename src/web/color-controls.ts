import { toHex } from '../color/convert.js';
import { colorCss } from '../color/css.js';
import { parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import { node } from './ui.js';

export function colorCode(color: ColorValue) {
  const exactHex = color.space === 'srgb' && [...color.components, color.alpha].every(channel =>
    Math.abs(Math.round(channel * 255) / 255 - channel) < 1e-12);
  return exactHex ? toHex(color).hex : colorCss(color);
}

function paint(swatch: HTMLElement, color?: ColorValue) {
  const code = color ? colorCode(color) : '';
  (swatch.firstElementChild as HTMLElement).style.backgroundColor = code;
  if (code) swatch.dataset.swatchCode = code;
  else delete swatch.dataset.swatchCode;
}

function patch(color?: ColorValue) {
  const swatch = node('span', undefined, 'color-chip');
  swatch.setAttribute('aria-hidden', 'true');
  swatch.append(node('span'));
  paint(swatch, color);
  return swatch;
}

export function colorToken(color: ColorValue, code = colorCode(color)) {
  const token = node('span', undefined, 'color-token');
  token.append(patch(color), node('code', code));
  return token;
}

export function colorInput(field: HTMLInputElement, parse: (value: string) => ColorValue | undefined = parseColor, showEmpty = true) {
  const group = node('span', undefined, 'color-input');
  const swatch = patch();
  field.before(group);
  group.append(swatch, field);
  function refresh() {
    let color: ColorValue | undefined;
    try { color = parse(field.value); } catch { /* An incomplete code has no sample. */ }
    swatch.hidden = !color && !showEmpty;
    paint(swatch, color);
  }
  field.addEventListener('input', refresh);
  refresh();
  return refresh;
}

let watching = false;

// A disclosure with real buttons keeps the swatches visible across browsers while the select retains its value and change event.
export function colorSelect(field: HTMLSelectElement, lookup: (value: string) => ColorValue | undefined) {
  const label = field.closest('label');
  const captionNodes = label ? [...label.childNodes].filter(child => child !== field) : [];
  const caption = captionNodes.map(child => child.textContent ?? '').join('').trim();
  const host = node('div', undefined, 'color-picker');
  const menu = node('details', undefined, 'color-select');
  const trigger = node('summary');
  const swatch = patch();
  const selected = node('span', undefined, 'color-select-value');
  const options = node('ul', undefined, 'color-select-options');
  if (field.id) trigger.id = field.id + '-trigger';
  trigger.append(swatch, selected);
  menu.append(trigger, options);
  if (label) {
    label.before(host);
    const title = node('span', undefined, 'color-picker-label');
    title.append(...captionNodes);
    host.append(title, field, menu);
    label.remove();
  } else {
    field.before(host);
    host.append(field, menu);
  }
  field.hidden = true;

  function refresh() {
    const text = field.selectedOptions[0]?.text ?? '';
    selected.textContent = text;
    trigger.setAttribute('aria-label', [caption, text].filter(Boolean).join(' · '));
    const color = lookup(field.value);
    swatch.hidden = !color;
    paint(swatch, color);
    options.replaceChildren(...[...field.options].map(option => {
      const row = node('li');
      const button = node('button');
      button.type = 'button';
      button.dataset.colorOption = option.value;
      button.disabled = option.disabled;
      button.setAttribute('aria-pressed', String(option.selected));
      const color = lookup(option.value);
      button.append(patch(color), node('span', option.text));
      button.addEventListener('click', () => {
        menu.open = false;
        trigger.focus({ preventScroll: true });
        if (option.value === field.value) return;
        field.value = option.value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      row.append(button);
      return row;
    }));
  }
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      trigger.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...options.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!buttons.length) return;
    event.preventDefault();
    menu.open = true;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      event.key === 'ArrowDown' ? Math.min(index + 1, buttons.length - 1) : index < 0 ? buttons.length - 1 : Math.max(0, index - 1);
    buttons[next]!.focus();
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget instanceof Node && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  if (!watching) {
    document.addEventListener('pointerdown', event => {
      if (!(event.target instanceof Node)) return;
      for (const open of document.querySelectorAll<HTMLDetailsElement>('.color-select[open]')) {
        if (!open.contains(event.target)) open.open = false;
      }
    });
    watching = true;
  }
  field.addEventListener('change', refresh);
  refresh();
  return { refresh, focus: () => trigger.focus(), host };
}
