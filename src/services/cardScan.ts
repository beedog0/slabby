// Raw card scan: read a loose card from the same on-device text recognition the slab scan uses,
// then find it in our copy of TCGplayer's catalog (0008_card_search.sql). The printed collector
// number and set size ("199/165", "TG05/TG30", "OP05-119") find the candidates; the set code
// ("SV8a", "MEW", "PAL EN") and the card name pick between cards that share a number. Japanese
// names aren't read (the recognizer is English), so Japanese cards lean on number and set code.
// Prices are the catalog's TCGplayer market; this path spends no PokemonPriceTracker credits.

import catalogJson from '../mocks/catalog.json';
import type { CatalogCard } from './search';
import { displayName, fromRow, type Row } from './search';
import { supabase } from './supabase';
import type { LabelLine } from './label';

export type CardNumber = {
  /** As printed, without the set size: "199", "TG05", "OP05-119", "SWSH123". */
  num: string;
  /** Set size when printed: "165", "TG30". */
  total: string | null;
};

export type ParsedCard = {
  numbers: CardNumber[];
  /** Set code candidates near the number, upper-cased: "SV8A", "MEW", "PAL". */
  codes: string[];
  /** Language hint from the bottom line: "EN" printed → en; a JP-style code without EN → ja. */
  language: 'en' | 'ja' | null;
  /** Every recognized word, upper-cased, for matching the card name. */
  words: Set<string>;
};

// A grader label in the frame: then it's a slab, never a raw card.
const SLAB_HINT = /\b(PSA|BGS|BECKETT|CGC|GEM\s?MT|GEM MINT|NM-MT|PRISTINE)\b/;
const CERT_LINE = /^\s*\d{8,10}\s*$/;

/** OCR slips inside numbers: O→0, l/I/|→1 next to digits. */
function fixDigits(t: string): string {
  return t
    .replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1')
    .replace(/\s*\/\s*/g, '/');
}

const SLASH = /(?<![A-Z0-9])([A-Z]{0,3}\d{1,3})\/([A-Z]{0,3}\d{2,3})(?![0-9])/g;
// One Piece (OP05-119, ST01-012, EB01-001, PRB01-…), Riftbound (OGN-301), Pokémon promos (SWSH123).
const DASH = /(?<![A-Z0-9])((?:OP|ST|EB|PRB)\d{2}-\d{3}|[A-Z]{3}-\d{3})(?![0-9])/g;
const PROMO = /(?<![A-Z0-9])((?:SWSH|SM|XY|BW)\d{2,3})(?![0-9])/g;
// Set codes printed beside the number: SV8a, S12a, SM12a, SV-P, or three capitals (MEW, PAL, SVI).
const CODE = /(?<![A-Za-z0-9])(SV\d{1,2}[a-zA-Z]?|S\d{1,2}[a-zA-Z]?|SM\d{1,2}[a-zA-Z]?|SV-?P|[A-Z]{3})(?![A-Za-z0-9])/g;
const NOT_CODES = new Set(['HP', 'EN', 'JP', 'GX', 'EX', 'VMAX', 'VSTAR', 'TAG', 'THE', 'AND', 'FOR', 'ILL', 'LV']);

/** True when the frame shows a grader label (front cert number, PSA/BGS/CGC, grade words). */
export function looksLikeSlab(input: (LabelLine | string)[]): boolean {
  return input.some((l) => {
    const t = typeof l === 'string' ? l : l.text;
    return SLAB_HINT.test(t) || CERT_LINE.test(t);
  });
}

/** Pull the collector number, set code and words from a raw card's recognized text. Null without a number. */
export function parseCardText(input: (LabelLine | string)[]): ParsedCard | null {
  const texts = input.map((l) => (typeof l === 'string' ? l : l.text)).map((t) => t.replace(/\s+/g, ' ').trim());
  const numbers: CardNumber[] = [];
  const codes: string[] = [];
  let en = false;
  let jpCode = false;
  const words = new Set<string>();
  const push = (n: CardNumber) => {
    if (!numbers.some((m) => m.num === n.num && m.total === n.total)) numbers.push(n);
  };

  for (const raw of texts) {
    for (const w of raw.toUpperCase().split(/[^A-Z0-9'é.-]+/i)) if (w.length >= 2) words.add(w.toUpperCase());
    const t = fixDigits(raw);
    let found = false;
    for (const m of t.toUpperCase().matchAll(SLASH)) {
      const [num, total] = [m[1], m[2]];
      // "1/2" style fractions in attack text are too short to be a set size.
      if (!/\d{2}/.test(total)) continue;
      push({ num, total });
      found = true;
    }
    for (const m of t.toUpperCase().matchAll(DASH)) {
      push({ num: m[1], total: null });
      found = true;
    }
    for (const m of t.toUpperCase().matchAll(PROMO)) {
      push({ num: m[1], total: null });
      found = true;
    }
    if (!found) continue;
    // The bottom line: set code and language sit on the same line as the number.
    if (/\bEN\b/.test(t)) en = true;
    for (const m of t.matchAll(CODE)) {
      const c = m[1].toUpperCase();
      if (NOT_CODES.has(c)) continue;
      if (!codes.includes(c)) codes.push(c);
      // Japanese sets print "SV8a" or "S12a" with no EN beside it.
      if (/^(SV|S|SM)\d/.test(c) && /[a-z]$/.test(m[1])) jpCode = true;
    }
  }
  if (!numbers.length) return null;
  return { numbers, codes, language: en ? 'en' : jpCode ? 'ja' : null, words };
}

/** Auto-read key: two frames with the same first number mean the card is held steady. */
export function cardSteadyKey(p: ParsedCard | null): string | null {
  const n = p?.numbers[0];
  return n ? `${strip(n.num)}/${n.total ? strip(n.total) : ''}` : null;
}

const strip = (s: string) => s.replace(/^([A-Z]*)0+(?=\d)/, '$1');

/** Ways TCGplayer may write a number: "025/198" and "25/198", "TG05/TG30". */
export function numberVariants(n: CardNumber): string[] {
  const out = new Set<string>();
  const nums = [n.num, strip(n.num)];
  if (n.total && /^\d+$/.test(n.num)) nums.push(n.num.padStart(n.total.replace(/\D/g, '').length, '0'));
  if (/^\d+$/.test(n.num)) nums.push(n.num.padStart(3, '0'));
  for (const x of nums) out.add(n.total ? `${x}/${n.total}` : x);
  return [...out];
}

export type CardMatch = { card: CatalogCard; score: number };

/**
 * Score a catalog card against what was read. Set code beats name (a code is exact, a name may be
 * half-read or Japanese); language breaks ties; a card with a market price is the likelier print.
 */
export function scoreCard(c: CatalogCard, p: ParsedCard): number {
  let s = 0;
  const code = (c.setCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code && p.codes.some((k) => k.replace(/[^A-Z0-9]/g, '') === code)) s += 4;
  const nameWords = displayName(c.name)
    .toUpperCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^A-Z0-9'é.-]+/i)
    .filter((w) => w.length >= 3);
  const hit = nameWords.filter((w) => p.words.has(w)).length;
  if (nameWords.length) s += (3 * hit) / nameWords.length;
  if (p.language && c.language === p.language) s += 1;
  if (c.marketCents) s += 0.25;
  return s;
}

/** Rank candidates best first. */
export function rankCards(cards: CatalogCard[], p: ParsedCard): CardMatch[] {
  return cards
    .map((card) => ({ card, score: scoreCard(card, p) }))
    .sort((a, b) => b.score - a.score || (b.card.marketCents ?? 0) - (a.card.marketCents ?? 0));
}

/** True when the best match is clearly ahead, so the sheet needn't offer a pick list first. */
export function isConfident(ranked: CardMatch[]): boolean {
  if (ranked.length === 1) return true;
  return ranked.length > 1 && ranked[0].score - ranked[1].score >= 2;
}

const mockCatalog = catalogJson as CatalogCard[];

/** Catalog cards printed with any of the read numbers, best match first (at most 8). */
export async function findScannedCard(p: ParsedCard): Promise<CardMatch[]> {
  const variants = [...new Set(p.numbers.slice(0, 3).flatMap(numberVariants))];
  let cards: CatalogCard[];
  if (!supabase) {
    cards = mockCatalog.filter((c) => c.number && variants.includes(c.number));
  } else {
    // select('*') so the scan still works before the printings column (0011) is applied.
    const { data, error } = await supabase.from('catalog').select('*').in('number', variants).limit(80);
    if (error) throw error;
    cards = ((data ?? []) as Row[]).map(fromRow);
  }
  return rankCards(cards, p).slice(0, 8);
}

/** Printings to offer when the catalog has none yet (Pokémon only; other games print one way). */
const FALLBACK_PRINTS = ['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition'];

/** The prints a scanned card can be, base first. Unpriced fallbacks until the catalog has them. */
export function printOptions(c: CatalogCard): { name: string; marketCents: number | null }[] {
  if (c.printings?.length) return c.printings.map((x) => ({ name: x.name, marketCents: x.marketCents }));
  return c.game === 'pokemon' ? FALLBACK_PRINTS.map((name) => ({ name, marketCents: null })) : [];
}
