import type { ClientBase } from 'pg';
import { checkContrast } from '../color/contrast.js';
import { colorCss } from '../color/css.js';
import { gameReadFamilies, readGamePreview } from '../game-preview/adapters.js';
import { gameFixtureProvider } from '../game-preview/fixtures.js';
import type { Locale } from '../model/locales.js';
import { changeThemeRelease, readPublicThemeRelease, readThemeRevision, saveThemeRevision, type ProjectActor } from './repository.js';
import { themeRoleKeys, type ThemeSnapshot } from './snapshot.js';

type Target = { projectId: string; assetId: string };
type Saved = Parameters<typeof saveThemeRevision>[2];
type Write = Pick<Saved, 'projectId' | 'assetId' | 'name' | 'operationId'>;
type ReleaseCommand = Parameters<typeof changeThemeRelease>[2];
type ExportFormat = 'json' | 'css';

function tokens(snapshot: ThemeSnapshot) {
  const colors = new Map(snapshot.swatches.map(swatch => [swatch.id, swatch.color]));
  return Object.fromEntries(themeRoleKeys.flatMap(role => {
    const id = snapshot.roles[role];
    return id ? [[role, colors.get(id)!] as const] : [];
  }));
}

function exported(themeId: string, revision: number, schemaVersion: number, status: 'draft' | 'released', snapshot: ThemeSnapshot,
  format: ExportFormat) {
  if (format === 'json') return { mediaType: 'application/json', body: JSON.stringify({
    schemaVersion, themeId, revision, status, swatches: snapshot.swatches, roles: snapshot.roles,
  }) };
  const declarations = Object.entries(tokens(snapshot)).map(([role, color]) => '  --' + role.replaceAll('.', '-') + ': ' + colorCss(color) + ';');
  return { mediaType: 'text/css', body: [':root {', ...declarations, '}', ''].join('\n') };
}

export async function exportPublicTheme(client: ClientBase, releaseId: string, format: ExportFormat) {
  const release = await readPublicThemeRelease(client, releaseId);
  return release ? exported(releaseId, release.revision, release.schemaVersion, 'released', release.payload, format) : null;
}

export function developerThemes(client: ClientBase, actor: ProjectActor, options: {
  now?: () => Date; fixture?: typeof gameFixtureProvider;
} = {}) {
  const revisionAt = (target: Target, revision: number) => readThemeRevision(client, actor, target.projectId, target.assetId, revision);
  async function copyRevision(input: Write & { sourceAssetId: string; sourceRevision: number }, expectedRevision: number) {
    const { sourceAssetId: assetId, sourceRevision: revision, projectId, ...target } = input;
    const source = await revisionAt({ projectId, assetId }, revision);
    if (!source) return { status: 'unavailable' } as const;
    return saveThemeRevision(client, actor, { ...target, projectId, expectedRevision, snapshot: source.payload, basedOn: { assetId, revision } });
  }
  return {
    create: (input: Omit<Saved, 'expectedRevision' | 'basedOn'>) => saveThemeRevision(client, actor, { ...input, expectedRevision: 0 }),
    edit: (input: Omit<Saved, 'basedOn'>) => saveThemeRevision(client, actor, input),
    fork: (input: Write & { sourceAssetId: string; sourceRevision: number }) => copyRevision(input, 0),
    restore(input: Write & { sourceRevision: number; expectedRevision: number }) {
      return copyRevision({ ...input, sourceAssetId: input.assetId }, input.expectedRevision);
    },
    async compare(input: Target & { before: number; after: number }) {
      const before = await revisionAt(input, input.before);
      if (!before) return null;
      const after = await revisionAt(input, input.after);
      if (!after) return null;
      const source = tokens(before.payload), target = tokens(after.payload);
      const oldColors = new Map(before.payload.swatches.map(swatch => [swatch.id, swatch.color]));
      const newColors = new Map(after.payload.swatches.map(swatch => [swatch.id, swatch.color]));
      const swatchIds = new Set([...oldColors.keys(), ...newColors.keys()]);
      return { before: before.revision, after: after.revision,
        swatchOrderChanged: JSON.stringify([...oldColors.keys()]) !== JSON.stringify([...newColors.keys()]),
        changedSwatches: [...swatchIds].filter(id => JSON.stringify(oldColors.get(id)) !== JSON.stringify(newColors.get(id))).sort(),
        changedRoles: themeRoleKeys.filter(role => JSON.stringify(source[role]) !== JSON.stringify(target[role]) ||
          before.payload.roles[role] !== after.payload.roles[role]).sort() };
    },
    release: (input: Omit<Extract<ReleaseCommand, { type: 'release' }>, 'type'>) =>
      changeThemeRelease(client, actor, { ...input, type: 'release' }),
    withdraw: (input: Omit<Extract<ReleaseCommand, { type: 'withdraw' }>, 'type'>) =>
      changeThemeRelease(client, actor, { ...input, type: 'withdraw' }),
    async exportRevision(input: Target & { revision: number; format: ExportFormat }) {
      const revision = await revisionAt(input, input.revision);
      return revision ? exported(input.assetId, revision.revision, revision.schemaVersion,
        revision.wasReleased ? 'released' : 'draft', revision.payload, input.format) : null;
    },
    async preview(input: Target & { revision: number; locale: Locale; mode?: 'fixture' | 'live' }) {
      const revision = await revisionAt(input, input.revision);
      if (!revision || input.mode === 'live') return { status: 'unavailable' } as const;
      const scope = { organizationId: actor.organizationId, projectId: input.projectId, gameId: 'color-kitchen-reference' };
      const now = options.now?.() ?? new Date();
      const provider = (options.fixture ?? gameFixtureProvider)(scope, actor.principalId, now);
      const scenes = [];
      for (const family of gameReadFamilies) {
        const data = await readGamePreview(client, actor, provider, { ...scope, family, recordId: 'sample', locale: input.locale }, now);
        if (data.status === 'denied') return { status: 'unavailable' } as const;
        if (data.status !== 'ready') return { status: data.status } as const;
        scenes.push({ family, data: data.data });
      }
      const colors = tokens(revision.payload);
      const contrast = ([['tile.text','scene.background'], ['action.label','action.primary']] as const).map(([foreground, background]) => {
        const text = colors[foreground], surface = colors[background];
        const measurement = text && surface && text.alpha === 1 && surface.alpha === 1 ? checkContrast(text, surface) : null;
        return { foreground, background, measurement };
      });
      return { status: 'ready', source: 'fixture', locale: input.locale, revision: revision.revision, colors, scenes, contrast } as const;
    },
  };
}
