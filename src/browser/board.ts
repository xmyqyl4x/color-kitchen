import { parseColor } from '../color/parse.js';
import type { MediaTask } from '../media/protocol.js';
import { composeMoodboard } from '../preview/moodboard.js';
import type { BoardDocument, StoredAsset } from './document.js';

function boardLayout(board: BoardDocument) {
  const composition = board.composition ?? { width: 960, height: 640, padding: 18, spacing: 10,
    background: parseColor('#F7F8F4'), legend: true };
  return { ...composition, layout: board.layout, palette: board.palette, caption: board.caption };
}

export function validateBoardComposition(board: BoardDocument) {
  if (board.placements && Object.keys(board.placements).some(id => !board.assetIds.includes(id))) {
    throw new RangeError('A placement references a missing board image.');
  }
  if (!board.placements && !board.composition) return;
  composeMoodboard({ ...boardLayout(board), images: board.assetIds.map(id =>
    ({ ...board.placements?.[id], id, width: 256, height: 256 })) });
}

export async function boardTask(board: BoardDocument, read: (id: string) => Promise<StoredAsset | null>,
    backing?: Extract<MediaTask, { kind: 'moodboard' }>['backing']) {
  const images = await Promise.all(board.assetIds.map(async id => {
    const asset = await read(id);
    if (!asset) throw new RangeError('A referenced board image is unavailable.');
    return { ...board.placements?.[id], id, source: asset.blob };
  }));
  return { kind: 'moodboard', backing, input: { ...boardLayout(board), images } } as const;
}
