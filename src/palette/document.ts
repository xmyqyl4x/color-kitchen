import type { PaletteDocument } from '../browser/document.js';
import { clampUnit, convertColor } from '../color/convert.js';
import { assertColor, inRange } from '../color/parse.js';
import type { ColorValue, Palette, Swatch } from '../model/color.js';
import { generateColors, maxSwatches, minSwatches, type GenerationOptions } from './generate.js';

export class PaletteEditError extends Error {
  constructor(public readonly code: 'stale' | 'locked' | 'bound-role', message: string) {
    super(message);
    this.name = 'PaletteEditError';
  }
}

export type PaletteCommand =
  | { type: 'generate'; options: GenerationOptions }
  | { type: 'adjust'; lightness: number; chroma: number }
  | { type: 'set-color'; id: string; color: ColorValue }
  | { type: 'set-lock'; id: string; locked: boolean }
  | { type: 'add'; id: string; color: ColorValue }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'move'; id: string; index: number }
  | { type: 'remove'; id: string; roles?: Readonly<Record<string, string | null>> }
  | { type: 'assign-role'; role: string; id: string | null }
  | { type: 'apply-suggestion'; changes: readonly Readonly<{ id: string; color: ColorValue }>[]; roles?: Readonly<Record<string, string>> }
  | { type: 'undo' }
  | { type: 'redo' };

export type PaletteSession = Readonly<{
  document: PaletteDocument;
  undo: readonly Palette[];
  redo: readonly Palette[];
}>;

const swatchId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const roleName = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const historyLimit = 50;

function checkRole(role: string) {
  if (role.length > 80 || !roleName.test(role)) throw new RangeError('Invalid palette role key.');
}

function checkPalette(palette: Palette) {
  const { swatches, roles } = palette;
  if (!Array.isArray(swatches) || swatches.length < minSwatches || swatches.length > maxSwatches ||
      typeof roles !== 'object' || roles === null || Array.isArray(roles)) {
    throw new RangeError('Invalid palette document.');
  }
  const ids = new Set<string>();
  for (const swatch of swatches) {
    if (typeof swatch.id !== 'string' || !swatchId.test(swatch.id) || ids.has(swatch.id) || typeof swatch.locked !== 'boolean') {
      throw new RangeError('Swatch IDs must be valid and unique.');
    }
    assertColor(swatch.color);
    ids.add(swatch.id);
  }
  for (const [role, id] of Object.entries(roles)) {
    checkRole(role);
    if (!ids.has(id)) throw new RangeError('Palette roles must reference a swatch.');
  }
}

export function openPaletteSession(document: PaletteDocument): PaletteSession {
  if (document.kind !== 'palette' || document.schemaVersion !== 1 || !Number.isSafeInteger(document.revision) ||
      document.revision < 1 || !Number.isSafeInteger(document.updatedAt) || document.updatedAt < 0) {
    throw new RangeError('Unsupported palette document version or timestamp.');
  }
  checkPalette(document.palette);
  return { document: structuredClone(document), undo: [], redo: [] };
}

function position(palette: Palette, id: string) {
  const index = palette.swatches.findIndex(item => item.id === id);
  if (index < 0) throw new RangeError('Palette swatch does not exist.');
  return index;
}

function checkNewSwatch(palette: Palette, id: string) {
  if (palette.swatches.length >= maxSwatches || typeof id !== 'string' || !swatchId.test(id) ||
      palette.swatches.some(swatch => swatch.id === id)) {
    throw new RangeError('A new swatch needs a unique ID and space in the palette.');
  }
}

function equalColor(left: ColorValue, right: ColorValue) {
  return left.space === right.space && left.alpha === right.alpha &&
    left.components.every((value, index) => value === right.components[index]);
}

function withColors(palette: Palette, choose: (color: ColorValue, index: number) => ColorValue): Palette {
  let changed = false;
  const swatches = palette.swatches.map((swatch, index) => {
    if (swatch.locked) return swatch;
    const color = choose(swatch.color, index);
    if (equalColor(swatch.color, color)) return swatch;
    changed = true;
    return { ...swatch, color };
  });
  return changed ? { ...palette, swatches } : palette;
}

function roleAssignment(roles: Palette['roles'], role: string, id: string | null) {
  const next = { ...roles };
  if (id === null) delete next[role];
  else next[role] = id;
  return next;
}

type Edit = Exclude<PaletteCommand, { type: 'undo' } | { type: 'redo' }>;

export function previewPaletteEdit(palette: Palette, command: Edit): Palette {
  switch (command.type) {
    case 'apply-suggestion': {
      if (!command.changes.length || command.changes.length > maxSwatches ||
          new Set(command.changes.map(change => change.id)).size !== command.changes.length) {
        throw new RangeError('A suggestion needs distinct target swatches.');
      }
      let next = palette;
      for (const change of command.changes) {
        next = previewPaletteEdit(next, { type: 'set-color', id: change.id, color: change.color });
      }
      for (const [role, id] of Object.entries(command.roles ?? {})) {
        next = previewPaletteEdit(next, { type: 'assign-role', role, id });
      }
      return next;
    }
    case 'generate': {
      const candidates = generateColors(palette.swatches.length, command.options);
      return withColors(palette, (_, index) => candidates[index]!);
    }
    case 'adjust': {
      if (!inRange(command.lightness, -1, 1) || !inRange(command.chroma, -1, 1)) {
        throw new RangeError('Palette adjustments must be in [-1, 1].');
      }
      if (command.lightness === 0 && command.chroma === 0) return palette;
      return withColors(palette, input => {
        const { color } = convertColor(input, 'oklch');
        const [l, c, hue] = color.components;
        const chroma = c * (1 + command.chroma);
        if (!Number.isFinite(chroma)) throw new RangeError('Adjusted chroma exceeded numeric bounds.');
        return { space: 'oklch', components: [clampUnit(l + command.lightness), chroma, hue], alpha: input.alpha };
      });
    }
    case 'set-color':
    case 'set-lock': {
      const index = position(palette, command.id);
      const swatch = palette.swatches[index]!;
      let updated: Swatch;
      if (command.type === 'set-color') {
        if (swatch.locked) throw new PaletteEditError('locked', 'Unlock the swatch before editing its value.');
        assertColor(command.color);
        if (equalColor(swatch.color, command.color)) return palette;
        updated = { ...swatch, color: structuredClone(command.color) };
      } else {
        if (typeof command.locked !== 'boolean') throw new RangeError('Invalid lock state.');
        if (swatch.locked === command.locked) return palette;
        updated = { ...swatch, locked: command.locked };
      }
      const swatches = [...palette.swatches];
      swatches[index] = updated;
      return { ...palette, swatches };
    }
    case 'add': {
      checkNewSwatch(palette, command.id);
      assertColor(command.color);
      return { ...palette, swatches: [...palette.swatches, { id: command.id, color: structuredClone(command.color), locked: false }] };
    }
    case 'duplicate': {
      checkNewSwatch(palette, command.newId);
      const index = position(palette, command.id);
      const swatches = [...palette.swatches];
      swatches.splice(index + 1, 0, { id: command.newId, color: palette.swatches[index]!.color, locked: false });
      return { ...palette, swatches };
    }
    case 'move': {
      const index = position(palette, command.id);
      if (!Number.isInteger(command.index) || command.index < 0 || command.index >= palette.swatches.length) {
        throw new RangeError('Swatch position is outside the palette.');
      }
      if (index === command.index) return palette;
      const swatches = [...palette.swatches];
      const [swatch] = swatches.splice(index, 1);
      swatches.splice(command.index, 0, swatch!);
      return { ...palette, swatches };
    }
    case 'remove': {
      position(palette, command.id);
      if (palette.swatches.length <= minSwatches) throw new RangeError('Keep at least two swatches.');
      const dependent = Object.keys(palette.roles).filter(role => palette.roles[role] === command.id);
      const decisions = command.roles ?? {};
      if (dependent.length !== Object.keys(decisions).length || dependent.some(role => !Object.hasOwn(decisions, role))) {
        throw new PaletteEditError('bound-role', 'Reassign or clear each bound role before removing this swatch.');
      }
      let roles = palette.roles;
      for (const role of dependent) {
        const id = decisions[role]!;
        if (id === command.id) throw new PaletteEditError('bound-role', 'Choose a different swatch for this role.');
        if (id !== null) position(palette, id);
        roles = roleAssignment(roles, role, id);
      }
      return { swatches: palette.swatches.filter(swatch => swatch.id !== command.id), roles };
    }
    case 'assign-role': {
      checkRole(command.role);
      if (command.id !== null) position(palette, command.id);
      const existing = Object.hasOwn(palette.roles, command.role) ? palette.roles[command.role] : null;
      if (existing === command.id) return palette;
      return { ...palette, roles: roleAssignment(palette.roles, command.role, command.id) };
    }
  }
}

function append(history: readonly Palette[], palette: Palette) {
  return [...history.slice(1 - historyLimit), palette];
}

export function applyPaletteCommand(session: PaletteSession, command: PaletteCommand, version: {
  expectedRevision: number; updatedAt: number;
}): PaletteSession {
  const { document, undo, redo } = session;
  if (document.revision !== version.expectedRevision) throw new PaletteEditError('stale', 'Refresh the current palette revision.');
  if (!Number.isSafeInteger(version.updatedAt) || version.updatedAt < 0 || document.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Invalid palette revision or timestamp.');
  }

  let palette: Palette | undefined;
  let nextUndo: readonly Palette[];
  let nextRedo: readonly Palette[];
  if (command.type === 'undo') {
    palette = undo.at(-1);
    nextUndo = undo.slice(0, -1);
    nextRedo = append(redo, document.palette);
  } else if (command.type === 'redo') {
    palette = redo.at(-1);
    nextUndo = append(undo, document.palette);
    nextRedo = redo.slice(0, -1);
  } else {
    palette = previewPaletteEdit(document.palette, command);
    nextUndo = append(undo, document.palette);
    nextRedo = [];
  }
  if (!palette || palette === document.palette) return session;
  return {
    document: { ...document, palette, revision: document.revision + 1, updatedAt: Math.max(document.updatedAt, version.updatedAt) },
    undo: nextUndo,
    redo: nextRedo,
  };
}
