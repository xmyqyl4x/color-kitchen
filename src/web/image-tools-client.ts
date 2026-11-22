import { boardTask } from '../browser/board.js';
import { openWorkspaceDatabase } from '../browser/database.js';
import type { BoardDocument, PaletteDocument, StoredAsset } from '../browser/document.js';
import { createBrowserMedia } from '../browser/media.js';
import { workspaceRepository } from '../browser/repository.js';
import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { parseColor } from '../color/parse.js';
import type { MediaResults, MediaTask } from '../media/protocol.js';
import type { ColorValue } from '../model/color.js';
import type { BoardLayout } from '../preview/moodboard.js';
import { readActiveDraft, readActivePalette, storeActivePalette } from './draft.js';
import { collectionText } from './collection-text.js';
import { openExportDrawer } from './export-drawer.js';
import { imageToolsText } from './image-tools-text.js';
import { screenTitle } from './strings.js';
import { clientLocale, get, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof imageToolsText>[1]) => imageToolsText(locale, key);
const mode = document.querySelector<HTMLElement>('[data-image-mode]')!.dataset.imageMode;
const isBoard = mode === 'moodboard';
const input = (id: string) => get<HTMLInputElement>(id);
const select = (id: string) => get<HTMLSelectElement>(id);
const output = get('image-result');
const status = get('image-status');
const file = input('image-file');
const cancel = get<HTMLButtonElement>('image-cancel');
const media = createBrowserMedia();
const canvas = get<HTMLCanvasElement>('image-canvas');
const boardPreview = get<HTMLImageElement>('board-preview');
let active: AbortController | undefined;
let current: { source: Blob; preview: MediaResults['image-preview'] } | undefined;
let extracted: ColorValue[] = [];
let assets: StoredAsset[] = [];
let board: BoardDocument | undefined;
let savedRevision: number | null = null;
let previewUrl: string | undefined;
const initialPalette = { roles: {}, swatches: ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'].map((hex, index) =>
  ({ id: 'board-' + index, color: parseColor(hex), locked: false })) };

function number(id: string) {
  const field = input(id);
  if (!field.validity.valid || !Number.isSafeInteger(field.valueAsNumber)) throw new RangeError('Invalid numeric field.');
  return field.valueAsNumber;
}
const region = () => ({ x: number('crop-x'), y: number('crop-y'), width: number('crop-width'), height: number('crop-height') });
const readAsset = async (id: string) => assets.find(asset => asset.id === id) ?? null;

async function work(operation: (signal: AbortSignal) => Promise<void>) {
  active?.abort();
  const controller = new AbortController();
  const { signal } = controller;
  active = controller;
  cancel.disabled = false;
  status.textContent = t('loading');
  try {
    await operation(signal);
    if (active === controller) status.textContent = signal.aborted ? t('canceled') : '';
  } catch {
    if (active === controller) status.textContent = signal.aborted ? t('canceled') : t('bad');
  } finally {
    if (active === controller) {
      active = undefined;
      cancel.disabled = true;
    }
  }
}

function job<T extends MediaTask>(task: T, signal: AbortSignal) {
  const handle = media.jobs.start(task, signal);
  handle.subscribe(stage => { if (!signal.aborted && stage === 'processing') status.textContent = t('processing'); });
  return handle.result;
}

function showPixels(preview: MediaResults['image-preview']['preview']) {
  canvas.width = preview.width;
  canvas.height = preview.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(preview.data), preview.width, preview.height), 0, 0);
  canvas.hidden = false;
}

function renderColors(colors: readonly ColorValue[]) {
  output.replaceChildren(...colors.map(color => {
    const item = node('div', undefined, 'image-color');
    const tile = node('span');
    tile.style.backgroundColor = colorCss(color);
    item.append(tile, node('code', toHex(color).hex));
    return item;
  }));
}

async function example() {
  const sample = new OffscreenCanvas(640, 360);
  const context = sample.getContext('2d')!;
  const shape = (color: string, points: readonly [number, number][]) => {
    context.fillStyle = color;
    context.beginPath();
    for (const [index, [x, y]] of points.entries()) {
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  };
  context.fillStyle = '#E9DED0';
  context.fillRect(0, 0, 640, 360);
  context.fillStyle = '#E4B363';
  context.beginPath(); context.ellipse(480, 95, 65, 47, 0, 0, 2 * Math.PI); context.fill();
  shape('#6F8F7B', [[0, 250], [184, 82], [373, 285], [540, 172], [640, 230], [640, 360], [0, 360]]);
  shape('#213C35', [[0, 305], [199, 225], [373, 318], [535, 250], [640, 290], [640, 360], [0, 360]]);
  shape('#F8F5EF', [[320, 220], [355, 253], [347, 290], [407, 360], [375, 360], [325, 292], [332, 260]]);
  return sample.convertToBlob();
}

async function choose(sources: readonly Blob[]) {
  await work(async signal => {
    if (!sources.length || sources.length > (isBoard ? 4 : 1)) throw new RangeError('Choose one to four images.');
    if (isBoard) {
      for (const source of sources) await job({ kind: 'image-preview', source, maxSide: 8 }, signal);
      signal.throwIfAborted();
      const incoming = sources.map(blob => ({ id: crypto.randomUUID(), blob }));
      const prior = readBoard();
      const next: BoardDocument = { ...prior, assetIds: incoming.map(asset => asset.id), placements: {},
        layout: prior.layout === 'two-image' && incoming.length !== 2 ? 'bottom-strip' : prior.layout };
      const task = await boardTask(next, async id => incoming.find(asset => asset.id === id) ?? null);
      const render = await job(task, signal);
      signal.throwIfAborted();
      assets = incoming;
      placements = {};
      configureImages();
      selectedImage = select('board-image').value;
      select('board-layout').value = next.layout;
      showBoard(render.blob);
      board = next;
    } else {
      const source = sources[0]!;
      const preview = await job({ kind: 'image-preview', source }, signal);
      signal.throwIfAborted();
      current = { source, preview };
      const { width, height } = preview.source;
      input('crop-x').value = input('crop-y').value = input('point-x').value = input('point-y').value = '0';
      input('crop-width').value = String(width);
      input('crop-height').value = String(height);
      input('crop-width').max = String(width);
      input('crop-height').max = String(height);
      input('crop-x').max = input('point-x').max = String(width - 1);
      input('crop-y').max = input('point-y').max = String(height - 1);
      showPixels(preview.preview);
    }
  });
}

file.addEventListener('change', () => { const files = [...(file.files ?? [])]; file.value = ''; if (files.length) void choose(files); });
get('image-sample').addEventListener('click', async () => { try { await choose([await example()]); } catch { status.textContent = t('bad'); } });
get('image-paste').addEventListener('click', async () => {
  try {
    const read = await navigator.clipboard.read();
    for (const item of read) {
      const type = item.types.find(value => ['image/png', 'image/jpeg', 'image/webp'].includes(value));
      if (type) { await choose([await item.getType(type)]); return; }
    }
    status.textContent = t('clipboard');
  } catch { status.textContent = t('clipboard'); }
});
file.addEventListener('paste', event => {
  const images = [...(event.clipboardData?.files ?? [])].filter(image => image.type.startsWith('image/'));
  if (images.length) { event.preventDefault(); void choose(images); }
});
cancel.addEventListener('click', () => active?.abort());
cancel.disabled = true;

function pickPoint() {
  const selected = current;
  if (!selected) return;
  return work(async signal => {
    const point = { x: number('point-x'), y: number('point-y') };
    const result = await job({ kind: 'sample', source: selected.source, point }, signal);
    signal.throwIfAborted();
    extracted = [result.color, ...extracted].slice(0, 12);
    renderColors(extracted);
  });
}

if (!isBoard) {
  get('image-point').addEventListener('click', pickPoint);
  canvas.addEventListener('click', event => {
    if (!current) return;
    const rect = canvas.getBoundingClientRect();
    const point = media.image.previewPoint({ x: Math.min(canvas.width - 1, Math.floor((event.clientX - rect.x) * canvas.width / rect.width)),
      y: Math.min(canvas.height - 1, Math.floor((event.clientY - rect.y) * canvas.height / rect.height)) }, current.preview.preview);
    input('point-x').value = String(point.x);
    input('point-y').value = String(point.y);
    void pickPoint();
  });
  get('image-extract').addEventListener('click', () => {
    const selected = current;
    if (!selected) { status.textContent = t('bad'); return; }
    void work(async signal => {
      const options = { count: number('image-count'), region: region() };
      const result = await job({ kind: 'palette', source: selected.source, options }, signal);
      const preview = await job({ kind: 'image-preview', source: selected.source, region: options.region }, signal);
      signal.throwIfAborted();
      current = { ...selected, preview };
      extracted = result.colors.map(swatch => swatch.color);
      showPixels(preview.preview);
      renderColors(extracted);
    });
  });
  get('image-apply').addEventListener('click', () => {
    if (extracted.length < 2) { status.textContent = t('bad'); return; }
    const draft = readActiveDraft();
    if (draft && draft.saved?.editRevision !== draft.document.revision && !confirm(collectionText(locale, 'confirmOpen'))) return;
    const next: PaletteDocument = { schemaVersion: 1, kind: 'palette', id: crypto.randomUUID(), revision: 1, updatedAt: Date.now(),
      name: screenTitle(locale, 'image-to-palette'), palette: { roles: {},
        swatches: extracted.map((color, index) => ({ id: 'image-' + index, color, locked: false })) } };
    if (storeActivePalette(next)) location.href = '/' + locale + '/palette-studio';
    else status.textContent = collectionText(locale, 'storage');
  });
}

function configureImages() {
  const list = select('board-image');
  list.replaceChildren(...assets.map(({ id }, index) => new Option(t('image') + ' ' + (index + 1), id)));
  for (const [id, value] of Object.entries({ 'crop-x': 0, 'crop-y': 0, 'crop-width': 100, 'crop-height': 100, 'focus-x': 50, 'focus-y': 50 })) {
    input(id).value = String(value);
  }
}

let placements: NonNullable<BoardDocument['placements']> = {};
let selectedImage = '';
function savePlacement() {
  if (!selectedImage || !assets.some(asset => asset.id === selectedImage)) return;
  const { x, y, width, height } = region();
  if (x + width > 100 || y + height > 100) throw new RangeError('The crop must fit in the source image.');
  const crop = { x: x / 100, y: y / 100, width: Math.min(width / 100, 1 - x / 100),
    height: Math.min(height / 100, 1 - y / 100) };
  const focus = [number('focus-x') / 100, number('focus-y') / 100] as const;
  placements = { ...placements, [selectedImage]: { crop, focus } };
}
function showPlacement() {
  const { crop = { x: 0, y: 0, width: 1, height: 1 }, focus = [0.5, 0.5] } = placements[selectedImage] ?? {};
  for (const [id, value] of Object.entries({ 'crop-x': crop.x, 'crop-y': crop.y,
    'crop-width': crop.width, 'crop-height': crop.height, 'focus-x': focus[0], 'focus-y': focus[1] })) {
    input(id).value = String(Math.round(value * 100));
  }
}
function readBoard(): BoardDocument {
  if (selectedImage !== select('board-image').value) selectedImage = select('board-image').value;
  savePlacement();
  return { schemaVersion: 1, kind: 'board', id: board?.id ?? crypto.randomUUID(), revision: savedRevision ?? 1,
    name: board?.name ?? screenTitle(locale, 'moodboard'), updatedAt: Date.now(),
    assetIds: assets.map(asset => asset.id), layout: select('board-layout').value as BoardLayout,
    caption: input('board-caption').value, palette: board?.palette ?? readActivePalette()?.palette ?? initialPalette,
    composition: { width: board?.composition?.width ?? 960, height: board?.composition?.height ?? 640,
      spacing: number('board-spacing'), padding: number('board-padding'), legend: input('board-legend').checked,
      background: parseColor(input('board-background').value) },
    placements: Object.fromEntries(Object.entries(placements).filter(([id]) => assets.some(asset => asset.id === id))),
    ...(board?.tags ? { tags: board.tags } : {}),
  };
}
function showBoard(blob: Blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  boardPreview.src = previewUrl;
  boardPreview.hidden = false;
}

if (isBoard) {
  select('board-image').addEventListener('change', () => {
    try { savePlacement(); selectedImage = select('board-image').value; showPlacement(); }
    catch { select('board-image').value = selectedImage; status.textContent = t('bad'); }
  });
  get('board-render').addEventListener('click', () => {
    void work(async signal => {
      const next = readBoard();
      const task = await boardTask(next, readAsset);
      const result = await job(task, signal);
      signal.throwIfAborted();
      board = next;
      showBoard(result.blob);
    });
  });
  get('board-export').addEventListener('click', () => {
    try {
      if (!assets.length) throw new RangeError('Choose images.');
      openExportDrawer(locale, readBoard(), readAsset);
    } catch { status.textContent = t('bad'); }
  });
  let repository: ReturnType<typeof workspaceRepository> | undefined;
  try { repository = workspaceRepository(await openWorkspaceDatabase()); }
  catch { status.textContent = collectionText(locale, 'storage'); }
  const savedId = /^#saved=([a-zA-Z0-9_-]{1,120})$/.exec(location.hash)?.[1];
  let savedIds = new Set<string>();
  if (savedId && repository) {
    try {
      const saved = await repository.getDocument(savedId);
      if (saved?.kind !== 'board') throw new Error('Missing board.');
      const restored = await Promise.all(saved.assetIds.map(repository.getAsset));
      if (restored.some(asset => !asset)) throw new Error('Missing images.');
      board = saved;
      savedRevision = saved.revision;
      assets = restored.filter((asset): asset is StoredAsset => asset !== null);
      savedIds = new Set(saved.assetIds);
      configureImages();
      placements = saved.placements ?? {};
      selectedImage = select('board-image').value;
      showPlacement();
      select('board-layout').value = saved.layout;
      input('board-caption').value = saved.caption ?? '';
      if (saved.composition) {
        input('board-spacing').value = String(saved.composition.spacing);
        input('board-padding').value = String(saved.composition.padding);
        input('board-background').value = colorCss(saved.composition.background);
        input('board-legend').checked = saved.composition.legend === true;
      }
      await work(async signal => { showBoard((await job(await boardTask(saved, readAsset), signal)).blob); });
    } catch { status.textContent = t('bad'); }
  }
  const save = get<HTMLButtonElement>('board-save');
  save.addEventListener('click', async () => {
    if (!repository) { status.textContent = collectionText(locale, 'storage'); return; }
    if (!input('board-preserve').checked) { status.textContent = t('needsPermission'); return; }
    save.disabled = true;
    try {
      const next = readBoard();
      const preview = await media.jobs.start(await boardTask(next, readAsset)).result;
      const saved = await repository.saveDocument(next, {
        expectedRevision: savedRevision, updatedAt: Date.now(), newAssets: assets.filter(asset => !savedIds.has(asset.id)),
      });
      board = saved;
      savedRevision = saved.revision;
      savedIds = new Set(saved.assetIds);
      showBoard(preview.blob);
      status.textContent = t('saved');
    } catch { status.textContent = t('bad'); }
    finally { save.disabled = false; }
  });
}
