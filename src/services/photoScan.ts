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

/** What card-vision wrote down from a photo (supabase/functions/card-vision). */
export type VisionRead = {
  kind: 'slab' | 'card' | 'none';
  labelLines?: string[];
  name?: string | null;
  englishName?: string | null;
  number?: string | null;
  setCode?: string | null;
  language?: 'en' | 'ja' | 'ko' | 'zh' | 'other' | null;
};

/**
 * Turn the vision model's transcription into the same reads a live scan makes. A slab's label
 * lines go through the label parser; a loose card's number goes through the card-number parser,
 * and its name is only a search hint (the sheet names the card from the catalog match). A card
 * with a name but no readable number still opens, so the sheet can offer cards by that name.
 */
export function fromVision(v: VisionRead | null): PhotoRead {
  if (!v || v.kind === 'none') return { kind: 'miss', seen: '' };
  if (v.kind === 'slab') {
    const lines = (v.labelLines ?? []).filter((l) => l.trim());
    const label = parseLabel(lines);
    return label?.payload.PSACert.Subject ? { kind: 'slab', label } : { kind: 'miss', seen: lines.slice(0, 4).join(' · ') };
  }
  const name = (v.englishName || v.name || '').trim() || null;
  const code = (v.setCode ?? '').trim().toUpperCase();
  const numberLine = [code, (v.number ?? '').trim()].filter(Boolean).join(' ');
  const parsed = numberLine ? parseCardText([numberLine]) : null;
  if (!parsed?.numbers.length && !name) return { kind: 'miss', seen: '' };
  const words = new Set(parsed?.words ?? []);
  for (const w of (name ?? '').toUpperCase().split(/[^A-Z0-9'é.-]+/i)) if (w.length >= 2) words.add(w);
  const language = v.language && v.language !== 'other' ? v.language : (parsed?.language ?? null);
  return {
    kind: 'card',
    card: {
      numbers: parsed?.numbers ?? [],
      codes: [...new Set([...(parsed?.codes ?? []), ...(code ? [code] : [])])],
      language,
      words,
      name,
    },
  };
}
