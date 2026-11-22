import type { ClientBase } from 'pg';
import { isLocale, type Locale } from '../model/locales.js';
import { projectRole, type ProjectActor } from '../projects/repository.js';

export const gameReadFamilies = ['user', 'puzzle', 'word-resource', 'session', 'result', 'leaderboard'] as const;
export type GameReadFamily = typeof gameReadFamilies[number];
export type GameScope = Readonly<{ organizationId: string; projectId: string; gameId: string }>;
type GameRequest<F extends GameReadFamily = GameReadFamily> = GameScope & Readonly<{ family: F; recordId: string; locale: Locale }>;
type CellState = 'idle' | 'selected' | 'disabled';
type SessionPhase = 'ready' | 'playing' | 'finished';
type Outcome = 'win' | 'loss' | 'draw';
type GamePreviewData = {
  user: { label: string };
  puzzle: { columns: number; cells: CellState[] };
  'word-resource': { sampleLabel: string; license: string };
  session: { phase: SessionPhase; activeCell: number | null };
  result: { outcome: Outcome };
  leaderboard: { rows: { rank: number; label: string }[] };
};
export type GameSourceRecord = GameRequest & Readonly<{
  observedAt: string; visibility: 'preview' | 'private' | 'unpublished'; subjectId?: string; data: unknown;
}>;
export type GameReadProvider = {
  source: 'fixture';
  read(request: GameRequest, actor: ProjectActor): Promise<GameSourceRecord | null>;
};

function fields(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function label(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !/[\r\n]/.test(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const projections: { [F in GameReadFamily]: (value: Record<string, unknown>) => GamePreviewData[F] | null } = {
  user: value => label(value.label) ? { label: value.label } : null,
  puzzle: ({ columns, cells }) => integer(columns, 1, 20) && Array.isArray(cells) && cells.length > 0 && cells.length <= 400 &&
    cells.length % columns === 0 && cells.every((cell: unknown) => cell === 'idle' || cell === 'selected' || cell === 'disabled')
    ? { columns, cells: [...cells] } : null,
  'word-resource': ({ sampleLabel, license }) => label(sampleLabel) && label(license) ? { sampleLabel, license } : null,
  session: ({ phase, activeCell }) => (phase === 'ready' || phase === 'playing' || phase === 'finished') &&
    (activeCell === null || integer(activeCell, 0, 399)) ? { phase, activeCell } : null,
  result: ({ outcome }) => outcome === 'win' || outcome === 'loss' || outcome === 'draw' ? { outcome } : null,
  leaderboard: ({ rows }) => {
    if (!Array.isArray(rows) || rows.length > 20) return null;
    const projected: GamePreviewData['leaderboard']['rows'] = [];
    for (const value of rows) {
      const row = fields(value);
      if (!row || !integer(row.rank, 1, 1_000_000) || !label(row.label)) return null;
      projected.push({ rank: row.rank, label: row.label });
    }
    return { rows: projected };
  },
};

export async function readGamePreview<F extends GameReadFamily>(client: ClientBase, actor: ProjectActor, provider: GameReadProvider,
  request: GameRequest<F>, now: Date): Promise<
    { status: 'ready'; source: 'fixture'; observedAt: string; data: GamePreviewData[F] } |
    { status: 'denied' | 'missing' | 'stale' | 'unavailable' }> {
  if (request.organizationId !== actor.organizationId || !await projectRole(client, actor, request.projectId)) {
    return { status: 'denied' };
  }
  if (!isLocale(request.locale) || !gameReadFamilies.includes(request.family)) return { status: 'unavailable' };
  let record: GameSourceRecord | null;
  try { record = await provider.read(request, actor); } catch { return { status: 'unavailable' }; }
  if (!record) return { status: 'missing' };
  if (record.organizationId !== actor.organizationId || record.projectId !== request.projectId || record.gameId !== request.gameId ||
      record.family !== request.family || record.recordId !== request.recordId || record.locale !== request.locale ||
      record.visibility !== 'preview' ||
      ((record.family === 'user' || record.family === 'session') && record.subjectId !== actor.principalId)) {
    return { status: 'denied' };
  }
  const observed = Date.parse(record.observedAt), age = now.getTime() - observed;
  if (!Number.isFinite(age) || age < 0) return { status: 'unavailable' };
  if (age > 300_000) return { status: 'stale' };
  const value = fields(record.data);
  const data = value && projections[request.family](value);
  if (!data) return { status: 'unavailable' };
  if (!await projectRole(client, actor, request.projectId)) return { status: 'denied' };
  return { status: 'ready', source: provider.source, observedAt: new Date(observed).toISOString(), data };
}
