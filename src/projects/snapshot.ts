import { assertColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';

export const themeRoleKeys = ['scene.background', 'tile.text', 'selection.fill', 'selection.outline', 'action.primary', 'action.label'] as const;
export type ThemeRole = typeof themeRoleKeys[number];
export type ThemeSnapshot = Readonly<{
  swatches: readonly Readonly<{ id: string; color: ColorValue }>[];
  roles: Readonly<Partial<Record<ThemeRole, string>>>;
}>;

export function themeSnapshot(input: ThemeSnapshot): ThemeSnapshot {
  if (!input || !Array.isArray(input.swatches) || input.swatches.length < 1 || input.swatches.length > 12 ||
      typeof input.roles !== 'object' || input.roles === null || Array.isArray(input.roles)) throw new RangeError('Invalid theme snapshot.');
  const ids = new Set<string>();
  const swatches = input.swatches.map(({ id, color }) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || ids.has(id)) throw new RangeError('Invalid theme swatch ID.');
    assertColor(color);
    ids.add(id);
    const [x, y, z] = color.components;
    return { id, color: { space: color.space, components: [x, y, z] as const, alpha: color.alpha } };
  });
  const roles = Object.entries(input.roles).sort(([a], [b]) => a.localeCompare(b));
  if (roles.some(([key, id]) => !themeRoleKeys.some(role => role === key) || !id || !ids.has(id))) {
    throw new RangeError('Theme roles must reference a swatch in the same snapshot.');
  }
  return { swatches, roles: Object.fromEntries(roles) };
}
