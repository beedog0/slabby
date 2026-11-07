// Raw card scan: read a loose card from the same on-device text recognition the slab scan uses,
// then find it in our copy of TCGplayer's catalog (0008_card_search.sql). The printed collector
// number and set size ("199/165", "TG05/TG30", "OP05-119") find the candidates; the set code
// ("SV8a", "MEW", "PAL EN") and the card name pick between cards that share a number. Japanese
// names aren't read (the recognizer is English), so Japanese cards lean on number and set code.
// Prices are the catalog's TCGplayer market; this path spends no PokemonPriceTracker credits.

import catalogJson from '../mocks/catalog.json';
import type { CatalogCard } from './search';
import { displayName, fromRow, searchCards, type Row } from './search';
import { supabase } from './supabase';
import type { LabelLine } from './label';

export type CardNumber = {
  /** As printed, without the set size: "199", "TG05", "OP05-119", "SWSH123", "049". */
  num: string;
  /** Set size when printed: "165", "TG30", "SV-P" (Japanese promos print the promo code here). */
  total: string | null;
  /** Promo set code printed on the same line, for promos with no set size: "MEP", "SVP". */
  code?: string;
};

export type ScanLanguage = 'en' | 'ja' | 'ko' | 'zh';

export type ParsedCard = {
  numbers: CardNumber[];
  /** Set code candidates near the number, upper-cased: "SV8A", "MEW", "PAL", "MEP". */
  codes: string[];
  /** Language from the bottom line: "EN" → en, "KO"/"KOR" → ko, a JP-style code without EN → ja. */
  language: ScanLanguage | null;
  /** Every recognized word, upper-cased, for matching the card name. */
  words: Set<string>;
  /** The card's name as read from the top line ("Snivy", "Charizard ex"); null when none looks like one. */
  name?: string | null;
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

// Every format below has a test in __tests__/cardScan.test.ts; see the table at the top of it.
// Main sets and subsets: 199/165, 4/102, TG05/TG30, GG01/GG70, SV001/SV122, RC1/RC32, H1/H32.
const SLASH = /(?<![A-Z0-9])([A-Z]{0,3}\d{1,3}[A-Z]?)\/([A-Z]{0,3}\d{2,3})(?![0-9])/g;
// Japanese promos print the promo code as the set size: 001/SV-P, 123/S-P, 401/SM-P, 238/XY-P,
// 100/BW-P, 001/M-P, 013/30th-P (30th anniversary). OCR sometimes drops the dash.
const JP_PROMO = /(?<![A-Z0-9])(\d{1,3})\/((?:SV|SM|XY|BW|DP|S|M|30TH)-?P)(?![A-Z0-9])/g;
// One Piece (OP05-119, ST01-012, EB01-001, PRB01-001, P-001), Riftbound (OGN-301), Pokémon
// Japanese-style S-P without a number ahead.
const DASH = /(?<![A-Z0-9])((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3}|[A-Z]{3}-\d{3})(?![0-9])/g;
// English black star promos with the code fused to the number: SWSH123, SM100, XY67, BW04,
// HGSS01, DP45. (Wizards and Nintendo promos print a bare number; too ambiguous to read alone.)
const PROMO = /(?<![A-Z0-9])((?:SWSH|HGSS|SM|XY|BW|DP)\d{2,3})(?![0-9])/g;
// Newer English promos print code, language, number with no set size: "SVP EN 049", "MEP EN 051".
// The language may be misread ("IN)", "EN)") or missing; the code must be in capitals as printed.
const LANG_TOKEN = '(?:EN|[EI]N\\)?|FN|JP|JPN|KO|KOR|ZH|CHS|CHT|DE|FR|IT|ES|PT)';
const PROMO_LINE = new RegExp(`(?<![A-Za-z0-9])(SVP|MEP|SV-P|SWSHP|[A-Z]{2,4})\\s+${LANG_TOKEN}\\s*(\\d{1,3})(?![0-9/])`, 'g');
// Known promo codes also read without the language, or glued to it ("SVPEN 197").
const PROMO_BARE = /(?<![A-Za-z0-9])(SVP|MEP)(?:EN)?\s*(\d{1,3})(?![0-9/])/g;
// Some lines put the number first: "#094 · MEP EN".
const PROMO_AFTER = /(?<![A-Za-z0-9/])#?(\d{3})\s*[·•.]?\s*(SVP|MEP)\s*EN\b/g;
// Set codes printed beside the number: SV8a, S12a, SM12a, SV-P, or three capitals (MEW, PAL, SVI, MEP).
// Also 30C (30th Celebration) and Chinese codes (CSV1C, CS1a, AC2b).
const CODE = /(?<![A-Za-z0-9])(SV\d{1,2}[a-zA-Z]?|S\d{1,2}[a-zA-Z]?|SM\d{1,2}[a-zA-Z]?|SV-?P|30C|CS[VM]?\d{1,2}[a-zA-Z]?|AC\d[a-zA-Z]?|[A-Z]{3,4})(?![A-Za-z0-9])/g;
const NOT_CODES = new Set(['HP', 'EN', 'JP', 'JPN', 'KO', 'KOR', 'ZH', 'CHS', 'CHT', 'GX', 'EX', 'VMAX', 'VSTAR', 'TAG', 'THE', 'AND', 'FOR', 'ILL', 'LV', 'ILLUS', 'BASIC', 'STAGE']);

/** True when the frame shows a grader label (front cert number, PSA/BGS/CGC, grade words). */
export function looksLikeSlab(input: (LabelLine | string)[]): boolean {
  return input.some((l) => {
    const t = typeof l === 'string' ? l : l.text;
    return SLAB_HINT.test(t) || CERT_LINE.test(t);
  });
}

/**
 * The text to search, line by line. The recognizer often splits the tiny bottom line into pieces
 * ("J", "MEP EN", "049 ★"); pieces at the same height are also joined left to right.
 */
function textRows(input: (LabelLine | string)[]): string[] {
  const clean = (t: string) => t.replace(/\s+/g, ' ').trim();
  const out = input.map((l) => clean(typeof l === 'string' ? l : l.text));
  const placed = input.filter((l): l is LabelLine => typeof l !== 'string' && Number.isFinite(l.y));
  const used = new Set<LabelLine>();
  for (const l of placed) {
    if (used.has(l)) continue;
    const row = placed.filter((m) => !used.has(m) && Math.abs(m.y - l.y) < 0.012);
    row.forEach((m) => used.add(m));
    if (row.length > 1) out.push(clean(row.sort((a, b) => a.x - b.x).map((m) => m.text).join(' ')));
  }
  return out;
}

function languageOf(t: string): ScanLanguage | null {
  // Simplified Chinese set codes start CS (CSV1C, CS1a, CSM1a); traditional ones AC (AC1a).
  if (/(?<![A-Za-z0-9])(CS[VM]?\d|AC\d[a-z])/.test(t)) return 'zh';
  if (/(?<![A-Z])(KO|KOR)(?![A-Z])/.test(t)) return 'ko';
  if (/(?<![A-Z])(ZH|CHS|CHT)(?![A-Z])/.test(t)) return 'zh';
  if (/(?<![A-Z])(JP|JPN)(?![A-Z])/.test(t)) return 'ja';
  if (/(?<![A-Z])(EN|[EI]N\))(?![A-Z])/.test(t)) return 'en';
  return null;
}

// Words at the top of a card that aren't its name.
const NOT_NAME = /^(BASIC|STAGE ?[12]?|MEGA|TRAINER|ITEM|SUPPORTER|STADIUM|POK[EÉ]MON TOOL|ENERGY|EVOLVES FROM.*|HP.*|ILLUS.*|TERA|ACE SPEC|ABILITY)$/i;

/**
 * The card's name: the highest line that reads like one (letters, an optional "ex"/"V"/"GX"
 * suffix, not a stage word or HP). Used only to suggest similar cards when the number finds none.
 */
export function readName(input: (LabelLine | string)[]): string | null {
  const lines = input
    .map((l, i) => (typeof l === 'string' ? { text: l, y: i } : l))
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').replace(/\s*(HP|нр|Hp)\s*\d+.*$/, '').trim() }))
    .sort((a, b) => a.y - b.y);
  for (const l of lines) {
    const t = l.text.replace(/^(BASIC|STAGE ?[12])\s+/i, '');
    if (NOT_NAME.test(t)) continue;
    if (/^[A-Z][A-Za-z'é.\- ]{2,24}$/.test(t) && !/\d/.test(t) && t.split(' ').length <= 4) return t;
  }
  return null;
}

/** Pull the collector number, set code and words from a raw card's recognized text. Null without a number. */
export function parseCardText(input: (LabelLine | string)[]): ParsedCard | null {
  const texts = textRows(input);
  const numbers: CardNumber[] = [];
  const codes: string[] = [];
  let language: ScanLanguage | null = null;
  let jpCode = false;
  const words = new Set<string>();
  const push = (n: CardNumber) => {
    if (!numbers.some((m) => m.num === n.num && m.total === n.total)) numbers.push(n);
  };
  const addCode = (c: string) => {
    if (!NOT_CODES.has(c) && !codes.includes(c)) codes.push(c);
  };

  for (const raw of texts) {
    for (const w of raw.toUpperCase().split(/[^A-Z0-9'é.-]+/i)) if (w.length >= 2) words.add(w.toUpperCase());
    const t = fixDigits(raw);
    const up = t.toUpperCase();
    let found = false;
    for (const m of up.matchAll(JP_PROMO)) {
      const total = m[2].replace(/(?<!-)P$/, '-P').replace(/^-/, '');
      push({ num: m[1], total });
      addCode(total);
      jpCode = true;
      found = true;
    }
    for (const m of up.matchAll(SLASH)) {
      const [num, total] = [m[1], m[2]];
      // "1/2" style fractions in attack text are too short to be a set size.
      if (!/\d{2}/.test(total)) continue;
      push({ num, total });
      found = true;
    }
    for (const m of up.matchAll(DASH)) {
      push({ num: m[1], total: null });
      found = true;
    }
    for (const m of up.matchAll(PROMO)) {
      push({ num: m[1], total: null });
      found = true;
    }
    // Case-sensitive: attack text ("Vine Whip 20") isn't in capitals; the printed code is.
    for (const m of t.matchAll(PROMO_AFTER)) {
      push({ num: m[1], total: null, code: m[2] });
      addCode(m[2]);
      found = true;
    }
    for (const re of [PROMO_LINE, PROMO_BARE]) {
      for (const m of t.matchAll(re)) {
        const code = m[1].replace('-', '');
        if (NOT_CODES.has(code)) continue;
        push({ num: m[2], total: null, code });
        addCode(code);
        found = true;
      }
    }
    if (!found) continue;
    // The bottom line: set code and language sit on the same line as the number.
    language = language ?? languageOf(t);
    for (const m of t.matchAll(CODE)) {
      const c = m[1].toUpperCase();
      addCode(c);
      // Japanese sets print "SV8a" or "S12a" with no EN beside it.
      if (/^(SV|S|SM)\d/.test(c) && /[a-z]$/.test(m[1])) jpCode = true;
    }
  }
  if (!numbers.length) return null;
  // Korean cards print the same codes as Japanese ones; Hangul in the name or text tells them apart.
  if (texts.some((t) => /[\uAC00-\uD7A3]/.test(t))) language = 'ko';
  return { numbers, codes, language: language ?? (jpCode ? 'ja' : null), words, name: readName(input) };
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
  for (const x of nums) {
    out.add(n.total ? `${x}/${n.total}` : x);
    // TCGplayer writes the 30th anniversary promo code in lower case: "013/30th-P".
    if (n.total?.includes('TH-')) out.add(`${x}/${n.total.replace('TH-', 'th-')}`);
  }
  return [...out];
}

export type CardMatch = { card: CatalogCard; score: number };

/**
 * Score a catalog card against what was read. Set code beats name (a code is exact, a name may be
 * half-read or Japanese); language breaks ties; a card with a market price is the likelier print.
 */
export function scoreCard(c: CatalogCard, p: ParsedCard): number {
  let s = 0;
  const code = compact(c.setCode);
  if (code && p.codes.some((k) => compact(k) === code)) s += 4;
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

const compact = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Whether a catalog card can be the one read. A promo printed with its code and a bare number
 * ("MEP EN 049") only fits cards from that promo set: plenty of other promos are also "049", and
 * a wrong card with a confident price is worse than none.
 */
export function fitsRead(c: CatalogCard, p: ParsedCard): boolean {
  if (!c.number) return false;
  return p.numbers.some((n) => numberVariants(n).includes(c.number!) && (!n.code || compact(c.setCode) === compact(n.code)));
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
  // TCGplayer lists no Korean or Chinese Pokémon. Their numbers match Japanese cards, whose
  // price would be wrong, so these say there's no price source instead.
  if (!variants.length || p.language === 'ko' || p.language === 'zh') return [];
  let cards: CatalogCard[];
  if (!supabase) {
    cards = mockCatalog.filter((c) => c.number && variants.includes(c.number));
  } else {
    // select('*') so the scan still works before the printings column (0011) is applied.
    const { data, error } = await supabase.from('catalog').select('*').in('number', variants).limit(80);
    if (error) throw error;
    cards = ((data ?? []) as Row[]).map(fromRow);
  }
  return rankCards(
    cards.filter((c) => fitsRead(c, p)),
    p,
  ).slice(0, 8);
}

/** The number as printed, for the sheet: "199/165", "MEP 049", "SWSH123". */
export function printedNumber(n: CardNumber): string {
  return n.total ? `${n.num}/${n.total}` : n.code ? `${n.code} ${n.num}` : n.num;
}

/** Why a read card found nothing: a language or promo set TCGplayer doesn't carry yet, or a misread. */
export function missReason(p: ParsedCard): string {
  if (p.language === 'ko') return 'Korean cards have no price source yet.';
  if (p.language === 'zh') return 'Chinese cards have no price source yet.';
  const n = p.numbers[0];
  if (n?.code) return `${printedNumber(n)} isn’t in TCGplayer’s catalog yet, so there’s no price source yet. New promos usually show up within a few weeks.`;
  return 'It may be misread or not in the catalog yet. Search for it by name instead.';
}

/**
 * Cards with the name read when the number finds nothing: promos with no set (McDonald's,
 * regional prints), or a set the catalog doesn't carry. Same number first, then the read
 * language, then the pricier (likelier collected) print. Korean and Chinese prints get none:
 * an English or Japanese card's price would be wrong for them.
 */
export async function findSimilarCards(p: ParsedCard): Promise<CatalogCard[]> {
  if (!p.name || p.language === 'ko' || p.language === 'zh') return [];
  const found = await searchCards(p.name, 'pokemon');
  return rankSimilar(found, p).slice(0, 8);
}

/** Order similar cards: printed number first, then language, then name fit, then price. */
export function rankSimilar(cards: CatalogCard[], p: ParsedCard): CatalogCard[] {
  const nums = new Set(p.numbers.map((n) => strip(n.num)));
  const want = (p.name ?? '').toUpperCase();
  const score = (c: CatalogCard) => {
    const num = strip((c.number ?? '').split('/')[0].toUpperCase());
    const base = displayName(c.name).toUpperCase().replace(/\s*\(.*$/, '');
    return (nums.has(num) ? 4 : 0) + (p.language && c.language === p.language ? 2 : 0) + (base === want ? 1 : 0);
  };
  return cards
    .filter((c) => displayName(c.name).toUpperCase().includes(want))
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || (b.c.marketCents ?? 0) - (a.c.marketCents ?? 0))
    .map((x) => x.c);
}

/** Printings to offer when the catalog has none yet (Pokémon only; other games print one way). */
const FALLBACK_PRINTS = ['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition'];

/**
 * The print a card most likely is when the catalog doesn't list its printings yet: commons and
 * uncommons (and plain "Rare") are Normal; holo rares, ultra, illustration, secret and promo
 * cards are Holofoil.
 */
export function likelyPrint(rarity: string | null): string {
  const r = (rarity ?? '').toLowerCase();
  if (!r || /^(common|uncommon|rare)$/.test(r)) return 'Normal';
  return 'Holofoil';
}

/**
 * The prints a scanned card can be, the catalog's own (base) print first, so index 0 is the
 * default. Unpriced fallbacks, led by the likely print, until the catalog lists them.
 */
export function printOptions(c: CatalogCard): { name: string; marketCents: number | null }[] {
  if (c.printings?.length) return c.printings.map((x) => ({ name: x.name, marketCents: x.marketCents }));
  if (c.game !== 'pokemon') return [];
  const first = likelyPrint(c.rarity);
  return [first, ...FALLBACK_PRINTS.filter((n) => n !== first)].map((name, i) => ({ name, marketCents: i === 0 ? c.marketCents : null }));
}

/** TCGplayer's print names in plain words: "Reverse Holofoil" → "Reverse holo". */
export function printName(name: string): string {
  return name
    .replace(/Holofoil/g, 'holo')
    .replace(/^holo$/, 'Holo')
    .replace(/^(\w)/, (m) => m.toUpperCase());
}
