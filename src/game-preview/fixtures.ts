import type { Locale } from '../model/locales.js';
import type { GameReadProvider, GameScope } from './adapters.js';

const sampleWords: Record<Locale, string> = { en: 'Forest', fr: 'Forêt', es: 'Bosque', pt: 'Floresta', de: 'Wald' };
const playerLabels: Record<Locale, string> = { en: 'Player A', fr: 'Joueur A', es: 'Jugador A', pt: 'Jogador A', de: 'Spieler A' };

export function gameFixtureProvider(scope: GameScope, subjectId: string, observedAt: Date): GameReadProvider {
  return {
    source: 'fixture',
    async read(request) {
      if (request.organizationId !== scope.organizationId || request.projectId !== scope.projectId ||
          request.gameId !== scope.gameId || request.recordId !== 'sample') return null;
      const label = playerLabels[request.locale];
      const data = {
        user: { label },
        puzzle: { columns: 3, cells: ['idle', 'selected', 'idle', 'disabled', 'idle', 'idle'] },
        'word-resource': { sampleLabel: sampleWords[request.locale], license: 'fixture' },
        session: { phase: 'playing', activeCell: 1 },
        result: { outcome: 'win' },
        leaderboard: { rows: [{ rank: 1, label }, { rank: 2, label: label.replace(/A$/, 'B') }] },
      };
      return { ...scope, recordId: 'sample', family: request.family, locale: request.locale, observedAt: observedAt.toISOString(),
        visibility: 'preview', subjectId, data: data[request.family] };
    },
  };
}
