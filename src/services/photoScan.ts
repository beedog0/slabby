// Photo mode: one still (a tap of the shutter, or a photo from the camera roll) read in one go.
// Same readers as the live scan (src/services/label.ts, src/services/cardScan.ts), but there's
// no frame to keep text inside and no second frame to agree with: a still is sharp, so its
// one read is taken as is. The rules don't change: a slab needs a name to open the sheet, and
// the sheet won't add it without a grade; a loose card still goes through the catalog match,
// so its name always comes from the matched card.

import { looksLikeSlab, parseCardText, type ParsedCard } from './cardScan';
import { parseLabel, type LabelLine, type ParsedLabel } from './label';

export type PhotoRead =
  | { kind: 'slab'; label: ParsedLabel }
  | { kind: 'card'; card: ParsedCard }
  /** Nothing usable. `seen` is the first text read, for the miss message ('' when there was none). */
  | { kind: 'miss'; seen: string };

export function readPhoto(lines: (LabelLine | string)[]): PhotoRead {
  const rows = lines.map((l) => (typeof l === 'string' ? { text: l, x: 0, y: 0 } : l)).filter((l) => l.text.trim());
  // A grader label means slab; otherwise a collector number means a loose card. Raw cards print
  // "©2023 Pokémon", which can pass for a label's year and brand, so the number decides.
  const slabbed = looksLikeSlab(rows);
  const card = slabbed ? null : parseCardText(rows);
  if (card) return { kind: 'card', card };
  const label = parseLabel(rows);
  if (label?.payload.PSACert.Subject) return { kind: 'slab', label };
  return {
    kind: 'miss',
    seen: rows
      .slice(0, 4)
      .map((l) => l.text.trim())
      .join(' · '),
  };
}
