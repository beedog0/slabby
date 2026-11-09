// A closer read of one photo: when the whole picture gives no label or card number, read it
// again in overlapping pieces, each enlarged, the way you'd lean in to read the small print.
// A card held at arm's length prints its set code and number ("MEP EN 051") a few pixels tall;
// in a piece of the photo it's large enough for the text reader.

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LabelReader, type RecognizedLine } from '../../modules/label-reader';
import type { LabelLine } from './label';

export type Rect = { x: number; y: number; width: number; height: number };

/** Smallest text Photo mode asks the reader for, as a share of the picture's height. */
export const PHOTO_MIN_TEXT = 0.006;
const COLS = 2;
const ROWS = 3;
const OVERLAP = 0.3;
const TILE_W = 1400;

/** Overlapping pieces covering the whole picture, in pixels: COLS × ROWS, each sharing OVERLAP with its neighbours. */
export function tileRects(width: number, height: number, cols = COLS, rows = ROWS, overlap = OVERLAP): Rect[] {
  const tw = width / (cols - (cols - 1) * overlap);
  const th = height / (rows - (rows - 1) * overlap);
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = Math.round(c * tw * (1 - overlap));
      const y = Math.round(r * th * (1 - overlap));
      out.push({ x, y, width: Math.min(Math.round(tw), width - x), height: Math.min(Math.round(th), height - y) });
    }
  return out;
}

/** A piece's lines placed back on the whole picture (positions are 0..1 of the whole). */
export function placeLines(lines: RecognizedLine[], tile: Rect, width: number, height: number): LabelLine[] {
  return lines.map((l) => ({ text: l.text, x: (tile.x + l.x * tile.width) / width, y: (tile.y + l.y * tile.height) / height }));
}

/** Every line read from the pieces of the photo, top to bottom. Empty when it can't be read. */
export async function readInTiles(uri: string): Promise<LabelLine[]> {
  if (!LabelReader) return [];
  const reader = LabelReader;
  const whole = await manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 1 });
  const out: LabelLine[] = [];
  for (const t of tileRects(whole.width, whole.height)) {
    const piece = await manipulateAsync(whole.uri, [{ crop: { originX: t.x, originY: t.y, width: t.width, height: t.height } }, { resize: { width: TILE_W } }], {
      format: SaveFormat.JPEG,
      compress: 0.9,
    });
    try {
      out.push(...placeLines(await reader.recognize(piece.uri, { minTextHeight: PHOTO_MIN_TEXT }), t, whole.width, whole.height));
    } finally {
      try {
        reader.discard?.(piece.uri);
      } catch {}
    }
  }
  try {
    reader.discard?.(whole.uri);
  } catch {}
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}
