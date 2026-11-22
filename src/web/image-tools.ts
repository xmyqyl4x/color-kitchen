import type { Locale } from '../model/locales.js';
import { collectionText } from './collection-text.js';
import { html } from './shell.js';
import { screenTitle } from './strings.js';
import { imageToolsText } from './image-tools-text.js';

export function imageToolsScreen(locale: Locale, kind: 'image-to-palette' | 'moodboard') {
  const t = (key: Parameters<typeof imageToolsText>[1]) => html(imageToolsText(locale, key));
  const board = kind === 'moodboard';
  const field = (id: string, label: string, value: number, max: number, min = 0) => '<label>' + label +
    '<input id="' + id + '" type="number" value="' + value + '" min="' + min + '" max="' + max + '" inputmode="numeric"></label>';
  const action = (id: string, label: string, primary = false) => '<button class="button' + (primary ? ' primary' : '') +
    '" type="button" id="' + id + '">' + label + '</button>';
  return `<section class="studio image-tools" data-image-mode="${kind}">
    <h1>${html(screenTitle(locale, kind))}</h1><p>${t('local')}</p>
    <div class="image-tools-layout">
      <div class="studio-panel">
        <label>${t('choose')}<input type="file" id="image-file" accept="image/png,image/jpeg,image/webp"${board ? ' multiple' : ''}></label>
        <div class="studio-actions">${action('image-sample', t('sample'))}${action('image-paste', t('paste'))}
          ${action('image-cancel', t('cancel'))}</div>
        <p id="image-status" role="status"></p>
        <canvas id="image-canvas" hidden aria-label="${t('preview')}"></canvas>
        <img id="board-preview" hidden alt="${t('preview')}">
        <div id="image-result" class="image-result"></div>
      </div>
      <div class="studio-panel">
        ${board ? `<label>${t('layout')}<select id="board-layout">${(['bottom-strip', 'side-strip', 'two-image', 'square'] as const)
          .map(value => '<option value="' + value + '">' + t(value) + '</option>').join('')}</select></label>
          <label>${t('caption')}<input id="board-caption" maxlength="160"></label>
          <div class="numeric-grid">${field('board-spacing', t('spacing'), 10, 96)}${field('board-padding', t('padding'), 18, 96)}</div>
          <label>${t('background')}<input id="board-background" value="#F7F8F4"></label>
          <label><input id="board-legend" type="checkbox" checked> ${t('legend')}</label>
          <fieldset><legend>${t('placement')}</legend><label>${t('image')}<select id="board-image"></select></label>
          <div class="numeric-grid">${field('crop-x', 'X', 0, 99)}${field('crop-y', 'Y', 0, 99)}
          ${field('crop-width', t('width'), 100, 100, 1)}${field('crop-height', t('height'), 100, 100, 1)}
          ${field('focus-x', 'X · %', 50, 100)}${field('focus-y', 'Y · %', 50, 100)}</div></fieldset>
          <label><input id="board-preserve" type="checkbox"> ${t('preserve')}</label>
          <div class="studio-actions">${action('board-render', t('preview'), true)}${action('board-save', t('save'))}
          ${action('board-export', html(collectionText(locale, 'export')))}</div>` :
        `<fieldset><legend>${t('region')}</legend><div class="numeric-grid">${field('crop-x', 'X', 0, 40000000)}
          ${field('crop-y', 'Y', 0, 40000000)}${field('crop-width', t('width'), 1, 40000000, 1)}
          ${field('crop-height', t('height'), 1, 40000000, 1)}</div></fieldset>
          <fieldset><legend>${t('point')}</legend><div class="numeric-grid">${field('point-x', 'X', 0, 40000000)}
          ${field('point-y', 'Y', 0, 40000000)}</div>${action('image-point', t('samplePoint'))}</fieldset>
          ${field('image-count', t('count'), 5, 12, 2)}
          <div class="studio-actions">${action('image-extract', t('extract'), true)}${action('image-apply', t('use'))}</div>`}
      </div>
    </div>
  </section>`;
}
