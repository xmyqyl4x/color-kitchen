import { WorkspaceStorageError } from '../browser/database.js';
import type { PaletteDocument } from '../browser/document.js';
import { colorTools, createPaletteEditing } from '../browser/editing.js';
import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import { localColorGuide } from '../guide/local.js';
import { guidePaletteEdit, guideRoles, type GuideSuggestion } from '../guide/response.js';
import { collectionText } from './collection-text.js';
import { colorToolsText } from './color-tools-text.js';
import { readActiveDraft, storeActivePalette } from './draft.js';
import { guideText } from './guide-text.js';
import { screenTitle } from './strings.js';
import { studioText } from './studio-text.js';
import { clientLocale, get, node, press } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof guideText>[1]) => guideText(locale, key);
const c = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
const mode = get<HTMLSelectElement>('guide-mode');
const prompt = get<HTMLTextAreaElement>('guide-prompt');
const share = get<HTMLInputElement>('guide-share');
const task = get<HTMLSelectElement>('guide-task');
const result = get('guide-result');
const chat = get('guide-history');
const status = get('guide-status');
const undo = get<HTMLButtonElement>('guide-undo');
const submit = get<HTMLButtonElement>('guide-submit');
const cancel = get<HTMLButtonElement>('guide-cancel');
const figure = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const input = (id: string) => get<HTMLInputElement>(id).value;
const draft = readActiveDraft();
const initial: PaletteDocument = draft?.document ?? { kind: 'palette', schemaVersion: 1, revision: 1, id: crypto.randomUUID(),
  name: screenTitle(locale, 'color-guide'), updatedAt: Date.now(), palette: colorTools.newPalette({ seed: 17 }) };
const storage = async (): Promise<never> => { throw new WorkspaceStorageError('unavailable', 'Local storage unavailable.'); };
const editing = createPaletteEditing({ getDocument: storage, saveDocument: storage, deleteDocument: storage, restoreDocument: storage },
  initial, { now: Date.now, newId: () => crypto.randomUUID(), saved: draft?.saved });
const history: { role: 'user' | 'assistant'; text: string }[] = [];
let active: AbortController | undefined;
const selectedForShare = new Set<string>();
const promptKey = 'ck-guide-prompt';

function saveDraft() {
  const snap = editing.snapshot();
  if (!storeActivePalette(snap.document, snap.saved)) { status.textContent = c('storage'); return false; }
  undo.disabled = !snap.canUndo;
  selectedForShare.clear();
  updateSwatches();
  return true;
}
function updateSwatches() {
  get('guide-swatches').replaceChildren(...editing.snapshot().document.palette.swatches.map(({ id, color }) => {
    const label = node('label', ' ' + toHex(color).hex);
    const checkbox = node('input');
    checkbox.type = 'checkbox'; checkbox.checked = selectedForShare.has(id);
    checkbox.addEventListener('change', () => checkbox.checked ? selectedForShare.add(id) : selectedForShare.delete(id));
    label.prepend(checkbox);
    return label;
  }));
  get('guide-swatches').hidden = !share.checked;
}
function configure() {
  if (active) active.abort();
  get('guide-hosted').hidden = mode.value !== 'hosted';
  get('guide-local').hidden = mode.value === 'hosted';
  get('guide-pair').hidden = task.value !== 'contrast';
  result.replaceChildren();
  status.textContent = '';
}
mode.addEventListener('change', configure);
task.addEventListener('change', configure);
share.addEventListener('change', updateSwatches);
try { prompt.value = (sessionStorage.getItem(promptKey) ?? '').slice(0, 2000); } catch { /* Continue with an empty prompt. */ }
prompt.addEventListener('input', () => {
  try { sessionStorage.setItem(promptKey, prompt.value); } catch { /* The draft stays in the active field. */ }
});
cancel.addEventListener('click', () => active?.abort());
undo.addEventListener('click', () => {
  editing.edit({ type: 'undo' }, editing.snapshot().version);
  if (saveDraft()) status.textContent = t('undone');
  result.replaceChildren();
});

function appendTurn(role: 'user' | 'assistant', value: string) {
  history.push({ role, text: value.slice(0, 1000) });
  if (history.length > 8) history.shift();
  const line = node('li', value);
  line.dataset.turn = role;
  chat.append(line);
  if (chat.children.length > 24) chat.firstElementChild?.remove();
}

function verified(body: unknown): GuideSuggestion {
  const raw = body as GuideSuggestion | undefined;
  if (!raw || typeof raw.message !== 'string' || raw.message.length > 600 || !Array.isArray(raw.colors) ||
      raw.colors.length > 12 || !Array.isArray(raw.assessments) || raw.assessments.length > 4 ||
      typeof raw.roles !== 'object' || !raw.roles || Array.isArray(raw.roles)) throw new RangeError('Invalid Guide response.');
  for (const color of raw.colors) assertColor(color);
  for (const [role, index] of Object.entries(raw.roles)) {
    if (!guideRoles.some(name => name === role) || !Number.isInteger(index) || index < 0 || index >= raw.colors.length) {
      throw new RangeError('Invalid Guide role.');
    }
  }
  const assessments = raw.assessments.map(value => colorTools.checkContrast(value.foreground, value.background, value.backing ?? undefined));
  return { ...raw, assessments };
}

function show(suggestion: GuideSuggestion, selectedMode: 'local' | 'hosted') {
  const name = node('h2', t(selectedMode));
  const strip = node('div', undefined, 'guide-swatches');
  const assignments = node('div', undefined, 'guide-assignments');
  const view = editing.snapshot();
  const unlocked = view.document.palette.swatches.filter(swatch => !swatch.locked);
  const targets: HTMLSelectElement[] = [];
  suggestion.colors.forEach((color, index) => {
    const label = node('label', t('target') + ' · ' + toHex(color).hex);
    const tile = node('span'); tile.style.backgroundColor = colorCss(color);
    const role = guideRoles.filter(role => suggestion.roles[role] === index).map(role => studioText(locale, role)).join(', ');
    const chip = node('span', toHex(color).hex + (role ? ' · ' + role : ''), 'guide-chip'); chip.prepend(tile);
    strip.append(chip);
    const target = node('select');
    target.add(new Option(studioText(locale, 'none'), ''));
    unlocked.forEach(item => target.add(new Option(toHex(item.color).hex, item.id)));
    if (unlocked[index]) target.value = unlocked[index].id;
    targets.push(target);
    label.append(target);
    assignments.append(label);
  });
  const checks = node('ul');
  for (const assessment of suggestion.assessments) {
    checks.append(node('li', toHex(assessment.foreground).hex + ' / ' + toHex(assessment.background).hex +
      ' · ' + figure.format(assessment.ratio) + ' : 1 · AA ' + colorToolsText(locale, assessment.normal.aa.passes ? 'pass' : 'fail')));
  }
  result.replaceChildren(name, node('p', suggestion.message), strip);
  if (checks.children.length) result.append(checks);
  if (!suggestion.colors.length) return;
  let proposed: ReturnType<typeof editing.propose> | undefined;
  const previewStrip = node('div', undefined, 'collection-strip');
  const apply = press(studioText(locale, 'apply'), () => {
    if (!proposed) return;
    try { editing.apply(proposed); if (saveDraft()) status.textContent = t('applied'); result.replaceChildren(); }
    catch { status.textContent = t('choose'); }
  }, true);
  apply.disabled = true;
  const preview = press(t('preview'), () => {
    try {
      proposed = editing.propose(guidePaletteEdit(suggestion, targets.map(item => item.value)), view.version);
      previewStrip.replaceChildren(...proposed.preview.swatches.map(({ color }) => {
        const tile = node('span'); tile.style.backgroundColor = colorCss(color); tile.title = toHex(color).hex; return tile;
      }));
      apply.disabled = false;
      status.textContent = '';
    } catch { status.textContent = t('choose'); }
  });
  for (const target of targets) target.addEventListener('change', () => {
    proposed = undefined; apply.disabled = true; previewStrip.replaceChildren();
  });
  const actions = node('div', undefined, 'studio-actions');
  actions.append(preview, apply);
  if (suggestion.colors.length >= 2) actions.append(press(t('newPalette'), () => {
    const current = readActiveDraft();
    if (current && current.saved?.editRevision !== current.document.revision && !confirm(c('confirmOpen'))) return;
    const swatches = suggestion.colors.map((color, index) => ({ id: 'guide-' + index, color, locked: false }));
    const roles = Object.fromEntries(Object.entries(suggestion.roles).map(([role, index]) => [role, swatches[index]!.id]));
    const next = { ...initial, id: crypto.randomUUID(), name: screenTitle(locale, 'color-guide'), revision: 1,
      updatedAt: Date.now(), palette: { swatches, roles } };
    if (storeActivePalette(next)) location.href = '/' + locale + '/palette-studio';
    else status.textContent = c('storage');
  }));
  result.append(assignments, previewStrip, actions);
}

get<HTMLFormElement>('guide-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (active) return;
  if (mode.value === 'local') {
    try {
      const entry = task.value === 'contrast' ? { kind: 'contrast' as const,
        foreground: parseColor(input('guide-fg')), background: parseColor(input('guide-bg')),
        backing: input('guide-backing').trim() ? parseColor(input('guide-backing')) : undefined } :
        { kind: 'palette' as const, options: { seed: crypto.getRandomValues(new Uint32Array(1))[0]! } };
      show(localColorGuide(locale, entry).suggestion, 'local');
      status.textContent = '';
    } catch { status.textContent = t('invalid'); }
    return;
  }
  const typed = prompt.value.trim();
  if (!typed || typed.length > 2000) { status.textContent = t('invalid'); return; }
  const run = new AbortController();
  active = run;
  const current = editing.snapshot().document.palette;
  const selectedColors = current.swatches.filter(swatch => selectedForShare.has(swatch.id)).map(swatch => swatch.color);
  submit.disabled = true;
  cancel.disabled = false;
  status.textContent = t('waiting');
  try {
    const response = await fetch('/api/v1/guide', { method: 'POST', signal: AbortSignal.any([run.signal, AbortSignal.timeout(15_000)]),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        submitted: true, locale, prompt: typed, history,
        ...(share.checked ? { shareSwatches: true, selectedColors } : {}),
      }) });
    const body = await response.json();
    if (!response.ok) {
      const retryAt = typeof body.error?.retryAt === 'string' ? new Date(body.error.retryAt) : null;
      status.textContent = t('failure') + (retryAt && Number.isFinite(retryAt.getTime())
        ? ' ' + t('retry') + ' ' + new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(retryAt) : '');
      return;
    }
    if (run.signal.aborted) return;
    const suggestion = verified(body.data?.status === 'ready' ? body.data.suggestion : undefined);
    appendTurn('user', typed);
    appendTurn('assistant', suggestion.message);
    if (prompt.value.trim() === typed) {
      prompt.value = '';
      try { sessionStorage.removeItem(promptKey); } catch { /* The completed input is cleared visually. */ }
    }
    show(suggestion, 'hosted');
    status.textContent = '';
  } catch { status.textContent = run.signal.aborted ? t('stopped') : t('failure'); }
  finally { active = undefined; submit.disabled = false; cancel.disabled = true; }
});
updateSwatches();
