import { checkContrast } from '../color/contrast.js';
import { parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import type { PaletteCommand } from '../palette/document.js';

export const guideRoles = ['background', 'surface', 'text', 'primary', 'accent', 'on-primary'] as const;
type Role = typeof guideRoles[number];

export class InvalidGuideReply extends Error {
  constructor() { super('The provider did not return a valid color suggestion.'); this.name = 'InvalidGuideReply'; }
}

export type GuideSuggestion = Readonly<{
  message: string;
  colors: readonly ColorValue[];
  roles: Readonly<Partial<Record<Role, number>>>;
  assessments: readonly ReturnType<typeof checkContrast>[];
}>;

function shape(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) throw new InvalidGuideReply();
  return value as Record<string, unknown>;
}

function color(input: unknown) {
  if (typeof input !== 'string' || input.length > 160) throw new InvalidGuideReply();
  return parseColor(input);
}

export function parseGuideReply(raw: unknown): GuideSuggestion {
  try {
    const { message, colors, roles, contrasts } = shape(raw, ['message', 'colors', 'roles', 'contrasts']);
    if (typeof message !== 'string' || !message.trim() || message.length > 600 || /[<>\u0000-\u0008\u000b-\u001f]/.test(message) ||
        /\p{N}/u.test(message.replace(/#[\da-f]{3,8}\b/gi, '')) ||
        !Array.isArray(colors) || colors.length > 12 || !Array.isArray(roles) || roles.length > guideRoles.length ||
        !Array.isArray(contrasts) || contrasts.length > 4) throw new InvalidGuideReply();
    const values = colors.map(color);
    const bindings = new Map<Role, number>();
    for (const role of roles) {
      const { name, index } = shape(role, ['name', 'index']);
      if (typeof name !== 'string' || !guideRoles.includes(name as Role) || bindings.has(name as Role) ||
          typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= values.length) throw new InvalidGuideReply();
      bindings.set(name as Role, index);
    }
    const assessments = contrasts.map(rawPair => {
      const { foreground, background, backing } = shape(rawPair, ['foreground', 'background', 'backing']);
      return checkContrast(color(foreground), color(background), backing === null ? undefined : color(backing));
    });
    return { message: message.trim(), colors: values, roles: Object.fromEntries(bindings), assessments };
  } catch (error) {
    if (error instanceof InvalidGuideReply) throw error;
    throw new InvalidGuideReply();
  }
}

export function guidePaletteEdit(suggestion: GuideSuggestion, selectedSwatchIds: readonly string[]): PaletteCommand {
  if (!selectedSwatchIds.length || selectedSwatchIds.length !== suggestion.colors.length ||
      new Set(selectedSwatchIds).size !== selectedSwatchIds.length) {
    throw new RangeError('Choose one distinct target for each color in the suggestion.');
  }
  return {
    type: 'apply-suggestion',
    changes: selectedSwatchIds.map((id, index) => ({ id, color: suggestion.colors[index]! })),
    roles: Object.fromEntries(Object.entries(suggestion.roles).map(([role, index]) => [role, selectedSwatchIds[index]!])) as Record<string, string>,
  };
}
