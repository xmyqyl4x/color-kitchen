import { colorCss } from '../color/css.js';
import { checkContrast, suggestForeground } from '../color/contrast.js';
import { convertColor, toHex, toHsl } from '../color/convert.js';
import { harmonyHues, shade, tint, tone } from '../color/effects.js';
import { parseColor } from '../color/parse.js';
import { gradientCss, reverseGradient, sampleGradient, validateGradient, type Gradient } from '../gradient/gradient.js';
import type { ColorValue } from '../model/color.js';
import { PaletteEditError, previewPaletteEdit, type PaletteCommand } from '../palette/document.js';
import { generatePalette } from '../palette/generate.js';
import { checkScaleExample, exportTailwindScale, generateColorScale, inspectBuiltInScale } from '../tailwind/scale.js';
import { localWorkspace, WorkspaceError } from '../workspace/workspace.js';
import { WorkspaceStorageError } from './database.js';
import type { GradientDocument } from './document.js';

type Version = Readonly<{ documentId: string; revision: number }>;
type GeneratedChange = Extract<PaletteCommand, { type: 'generate' | 'adjust' | 'apply-suggestion' }>;
type DirectEdit = Exclude<PaletteCommand, GeneratedChange>;
type Proposal = Readonly<{
  from: Version;
  preview: ReturnType<typeof previewPaletteEdit>;
}>;
type GradientChange = Readonly<{ type: 'replace'; gradient: Gradient }> | Readonly<{ type: 'reverse' }>;
type EditingCode = 'stale' | 'locked' | 'bound-role' | 'unsaved' | 'missing' | 'invalid' | 'storage';

export class EditingError extends Error {
  readonly messageId: `editing.error.${EditingCode}`;
  constructor(public readonly code: EditingCode, cause?: unknown) {
    super(code, { cause });
    this.name = 'EditingError';
    this.messageId = `editing.error.${code}`;
  }
}

function editingError(cause: unknown) {
  if (cause instanceof EditingError) return cause;
  if (cause instanceof PaletteEditError) return new EditingError(cause.code, cause);
  if (cause instanceof WorkspaceError) return new EditingError(cause.code === 'invalid-import' ? 'invalid' : cause.code, cause);
  if (cause instanceof WorkspaceStorageError) return new EditingError(
    cause.code === 'conflict' ? 'stale' : cause.code === 'invalid' ? 'invalid' : 'storage', cause);
  if (cause instanceof RangeError) return new EditingError('invalid', cause);
  return cause;
}

function run<T>(work: () => T): T {
  try { return work(); } catch (error) { throw editingError(error); }
}

async function persist<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw editingError(error); }
}

function requireVersion(current: { id: string; revision: number }, expected: Version) {
  if (current.id !== expected.documentId || current.revision !== expected.revision) throw new EditingError('stale');
}

export function createPaletteEditing(...options: Parameters<typeof localWorkspace>) {
  const workspace = run(() => localWorkspace(...options));
  const proposed = new WeakMap<Proposal, { from: Version; command: GeneratedChange }>();
  const current = () => workspace.current().document;
  function snapshot() {
    const session = workspace.current();
    return { document: structuredClone(session.document),
      version: { documentId: session.document.id, revision: session.document.revision } as Version,
      canUndo: session.undo.length > 0, canRedo: session.redo.length > 0, dirty: workspace.dirty(),
      saved: workspace.savedVersion() };
  }
  function change(command: PaletteCommand, expected: Version) {
    requireVersion(current(), expected);
    workspace.edit(command, expected.revision);
    return snapshot();
  }
  function propose(command: GeneratedChange, expected: Version): Proposal {
    return run(() => {
      requireVersion(current(), expected);
      const from = { ...expected };
      const preview = structuredClone(previewPaletteEdit(current().palette, command));
      const suggestion = { from: { ...from }, preview };
      proposed.set(suggestion, { from, command: structuredClone(command) });
      return suggestion;
    });
  }
  return {
    snapshot,
    edit(command: DirectEdit, expected: Version) {
      const possible = command as PaletteCommand;
      if (possible.type === 'generate' || possible.type === 'adjust' || possible.type === 'apply-suggestion') {
        throw new EditingError('invalid');
      }
      return run(() => change(command, expected));
    },
    propose,
    rename(name: string, expected: Version) {
      return run(() => {
        requireVersion(current(), expected);
        workspace.rename(name, expected.revision);
        return snapshot();
      });
    },
    apply(suggestion: Proposal) {
      const pending = proposed.get(suggestion);
      if (!pending) throw new EditingError('invalid');
      const result = run(() => change(pending.command, pending.from));
      proposed.delete(suggestion);
      return result;
    },
    contrast: (...parameters: Parameters<typeof workspace.contrast>) => run(() => workspace.contrast(...parameters)),
    proposeContrast(...parameters: Parameters<typeof workspace.proposeFix>) {
      const fix = run(() => workspace.proposeFix(...parameters));
      return fix ? propose({ type: 'apply-suggestion', changes: [{ id: fix.id, color: fix.color }] },
        { documentId: fix.documentId, revision: fix.expectedRevision }) : null;
    },
    preview: (...parameters: Parameters<typeof workspace.preview>) => run(() => workspace.preview(...parameters)),
    save: () => persist(() => workspace.save()),
    saveCopy: (name: string) => persist(() => workspace.saveCopy(name)),
    openCopy(...parameters: Parameters<typeof workspace.openCopy>) {
      run(() => workspace.openCopy(...parameters));
      return snapshot();
    },
    async openSaved(...parameters: Parameters<typeof workspace.openSaved>) {
      await persist(() => workspace.openSaved(...parameters));
      return snapshot();
    },
  };
}

export function createGradientEditing(initial: GradientDocument, now = Date.now) {
  let document = structuredClone(initial);
  run(() => {
    if (document.kind !== 'gradient' || document.schemaVersion !== 1 || !Number.isSafeInteger(document.revision) ||
        document.revision < 1 || !Number.isSafeInteger(document.updatedAt) || document.updatedAt < 0 || !document.id) {
      throw new RangeError('Invalid gradient document.');
    }
    validateGradient(document);
  });
  const snapshot = () => ({ document: structuredClone(document),
    version: { documentId: document.id, revision: document.revision } as Version });
  return {
    snapshot,
    edit(command: GradientChange, expected: Version) {
      return run(() => {
        requireVersion(document, expected);
        const { type, angle, center, interpolation, huePath, stops } = command.type === 'reverse'
          ? reverseGradient(document) : command.gradient;
        const updatedAt = now();
        if (!Number.isSafeInteger(updatedAt) || updatedAt < 0 || document.revision === Number.MAX_SAFE_INTEGER) {
          throw new RangeError('Invalid gradient revision or timestamp.');
        }
        const next = structuredClone({ ...document, type, angle, center, interpolation, huePath, stops,
          revision: document.revision + 1, updatedAt: Math.max(document.updatedAt, updatedAt) });
        validateGradient(next);
        document = next;
        return snapshot();
      });
    },
    sample: (count: number) => run(() => sampleGradient(document, count)),
    css: () => run(() => gradientCss(document)),
  };
}

export const colorTools = {
  inspect(input: string | ColorValue) {
    return run(() => {
      const color = typeof input === 'string' ? parseColor(input) : structuredClone(input);
      return { color, css: colorCss(color), hex: toHex(color), srgb: convertColor(color, 'srgb'),
        hsl: toHsl(color), oklch: convertColor(color, 'oklch').color };
    });
  },
  newPalette: generatePalette, tint, shade, tone, harmonyHues, checkContrast, suggestForeground,
  tailwind: { inspect: inspectBuiltInScale, generate: generateColorScale, export: exportTailwindScale, contrast: checkScaleExample },
};
