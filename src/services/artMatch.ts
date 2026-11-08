// Identify a card from its art, the way Alt does: no text needed. The phone finds and straightens
// the card in a photo (LabelReader.findCard), takes its fingerprint (supabase/functions/_shared/
// art-hash.ts) and asks match_card_art (0016_card_art.sql) for the nearest catalog cards. The
// text read still counts: a number or name read from the card confirms or overrules the art, so
// the name and price always come from a catalog card, and a promo reprinting the same art in two
// sets still asks which one.

import { artDistance, artPrint, colorDistance, type ArtPrint, type Rgb } from '../../supabase/functions/_shared/art-hash';
import type { FoundCard, RecognizedLine } from '../../modules/label-reader';
import { scoreCard, type CardMatch, type ParsedCard } from './cardScan';
import { fromRow, type CatalogCard, type Row } from './search';
import { supabase } from './supabase';

/** What LabelReader.findCard hands back: the straightened card's RGB pixels, base64. */
export type { FoundCard };

export type ArtHit = { card: CatalogCard; distance: number };

/**
 * Distance (artDistance) under which a card is taken as the one photographed, and the gap to the
 * next card with different art it must clear. Same card photographed: ~10–30. Different card:
 * 55+. Tuned with scripts/backtest.
 */
export const ART_SURE = 34;
export const ART_GAP = 8;
/** A card found with no card-shaped edge (the middle of the photo was used) must be this close. */
export const ART_SURE_NO_EDGE = 26;
/** Still worth showing in a "Which card is it?" list. */
export const ART_MAYBE = 46;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INDEX.get(clean[i]) ?? 0;
    const b = B64_INDEX.get(clean[i + 1]) ?? 0;
    const c = B64_INDEX.get(clean[i + 2]);
    const d = B64_INDEX.get(clean[i + 3]);
    out[o++] = (a << 2) | (b >> 4);
    if (c !== undefined && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined && c !== undefined && o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** The same pixels turned 180° (a card photographed upside down). */
export function rotate180(img: Rgb): Rgb {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    out[j * 3] = img.data[i * 3];
    out[j * 3 + 1] = img.data[i * 3 + 1];
    out[j * 3 + 2] = img.data[i * 3 + 2];
  }
  return { data: out, width: img.width, height: img.height };
}

/** Fingerprints of a found card, upright and turned round. */
export function printsOf(found: FoundCard): [ArtPrint, ArtPrint] {
  const img: Rgb = { data: decodeBase64(found.rgb), width: found.width, height: found.height };
  return [artPrint(img), artPrint(rotate180(img))];
}

type ArtRow = Row & { color: number[] | null; d_face: number; d_art: number; d_face2: number; d_art2: number };

/** Score rows from match_card_art against the photo's two fingerprints, nearest first. */
export function rankArt(rows: ArtRow[], prints: [ArtPrint, ArtPrint]): ArtHit[] {
  return rows
    .map((r) => {
      const up = artDistance(r.d_face, r.d_art, colorDistance(prints[0].color, r.color));
      const turned = artDistance(r.d_face2, r.d_art2, colorDistance(prints[1].color, r.color));
      return { card: fromRow(r), distance: Math.min(up, turned) };
    })
    .sort((a, b) => a.distance - b.distance);
}

/** Catalog cards nearest the photo's art, nearest first (empty without a backend). */
export async function matchArt(prints: [ArtPrint, ArtPrint], lim = 24): Promise<ArtHit[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('match_card_art', {
    face: prints[0].face,
    art: prints[0].art,
    face2: prints[1].face,
    art2: prints[1].art,
    lim,
  });
  if (error) throw error;
  return rankArt((data ?? []) as ArtRow[], prints);
}

/** Find the card in a photo and look its art up. Null when there's no reader or no backend. */
export async function identifyByArt(
  reader: { findCard?: (uri: string, options?: { region?: { x: number; y: number; width: number; height: number } }) => Promise<FoundCard | null> } | null,
  uri: string,
  region?: { x: number; y: number; width: number; height: number },
): Promise<{ hits: ArtHit[]; edge: boolean } | null> {
  if (!reader?.findCard || !supabase) return null;
  const found = await reader.findCard(uri, region ? { region } : undefined);
  if (!found) return null;
  const hits = await matchArt(printsOf(found));
  return { hits, edge: found.found };
}

/**
 * Whether the art alone settles it: the nearest card is close and the next one is well behind.
 * Cards sharing the art (a reprint, a promo and its set version) are close together, so they go
 * to "Which card is it?" instead.
 */
export function artSure(hits: ArtHit[], edge: boolean): boolean {
  const [best, next] = hits;
  if (!best || best.distance > (edge ? ART_SURE : ART_SURE_NO_EDGE)) return false;
  return !next || next.distance - best.distance >= ART_GAP;
}

/** Words of a card name, for comparing with what was read. */
const nameWords = (name: string) =>
  name
    .toUpperCase()
    .replace(/\(.*?\)|-.*$/g, ' ')
    .split(/[^A-Z0-9'é.]+/i)
    .filter((w) => w.length >= 3);

/** The read name (or words) agrees with a catalog card's name. */
export function nameFits(c: CatalogCard, read: ParsedCard | null): boolean {
  if (!read) return false;
  const words = nameWords(c.name);
  if (!words.length) return false;
  const seen = new Set([...read.words, ...nameWords(read.name ?? '')]);
  return words.some((w) => seen.has(w));
}

/** Score the art lends a candidate: 0 when it's far, up to 6 when it's the photo. */
export const artBonus = (distance: number | undefined) => (distance == null ? 0 : Math.max(0, Math.min(6, (ART_MAYBE - distance) / 2.5)));

/** Every number read is short and bare: one or two digits, no set size, no promo code. */
export function weakNumber(read: ParsedCard | null): boolean {
  return !!read?.numbers.length && read.numbers.every((n) => !n.total && !n.code && /^\d{1,2}$/.test(n.num));
}

/** The read's set size ("/100") is the card's, though the number itself didn't find it. */
export function sameSetSize(read: ParsedCard | null, c: CatalogCard): boolean {
  const total = (c.number ?? '').split('/')[1];
  if (!read || !total) return false;
  const bare = (s: string) => s.replace(/^0+(?=\d)/, '').toUpperCase();
  return read.numbers.some((n) => !!n.total && bare(n.total) === bare(total));
}

/** One card name and number, listed twice (two sets or two listings). */
export function sameCard(x: CatalogCard, y: CatalogCard): boolean {
  const name = (c: CatalogCard) => c.name.replace(/\s+-\s+[\w/-]*\d[\w/-]*/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim().toUpperCase();
  const num = (c: CatalogCard) => (c.number ?? '').split('/')[0].replace(/^0+(?=\d)/, '').toUpperCase();
  return x.productId !== y.productId && name(x) === name(y) && num(x) === num(y) && !!num(x);
}

/** Two art distances far enough apart that the nearer one is the photo (a stamp is a small change). */
export const TWIN_GAP = 4;
const artApart = (a: number | undefined, b: number | undefined) => a != null && b != null && b - a >= TWIN_GAP;

export type Identified = { matches: CardMatch[]; confident: boolean; byArt: boolean };

/**
 * Put the text read and the art together.
 * - A number was read and found cards: those are the candidates (text is exact), the art reorders
 *   them, so "which of these four 051s" is answered by the picture.
 * - Nothing found by number (missed, misread, or no number read): the art's candidates, with a read
 *   name pulling its cards forward. Confident only when the art is sure and no read name disagrees.
 */
export function combine(byNumber: CardMatch[], art: { hits: ArtHit[]; edge: boolean } | null, read: ParsedCard | null): Identified {
  const hits = art?.hits ?? [];
  const dist = new Map(hits.map((h) => [h.card.productId, h.distance]));
  // A short bare number ("6", "43": no set size, no code) is easily a misread or another line's
  // digits, and so is a number in the right set with one digit wrong (45/100 read as 43/100). When
  // the art is sure of a card that number didn't find, the art wins.
  if (byNumber.length && (weakNumber(read) || (hits[0] && sameSetSize(read, hits[0].card))) && art && artSure(hits, art.edge) && !byNumber.some((m) => m.score === Infinity || m.card.productId === hits[0].card.productId)) {
    return { matches: [{ card: hits[0].card, score: Infinity }, ...byNumber], confident: true, byArt: true };
  }
  if (byNumber.length) {
    // Both close enough to max out the bonus: the nearer art still goes first.
    const far = (m: CardMatch) => dist.get(m.card.productId) ?? Infinity;
    const matches = byNumber
      .map((m) => ({ card: m.card, score: m.score === Infinity ? Infinity : m.score + artBonus(dist.get(m.card.productId)) }))
      .sort((a, b) => b.score - a.score || far(a) - far(b) || (b.card.marketCents ?? 0) - (a.card.marketCents ?? 0));
    const [a, b] = matches;
    // The same card in two sets (a stamped reprint, a promo of a set card): only the art tells
    // them apart, so without a clear art gap the user picks rather than Slabby guessing.
    if (b && a.score !== Infinity && sameCard(a.card, b.card)) {
      const da = dist.get(a.card.productId);
      const db = dist.get(b.card.productId);
      // The text told them apart (a set code read): sure unless the art clearly says the other one.
      // Otherwise the art must.
      const sure = a.score - b.score >= 2 ? !artApart(db, da) : artApart(da, db);
      return { matches, confident: sure, byArt: false };
    }
    return { matches, confident: matches.length === 1 || a.score === Infinity || a.score - b.score >= 2, byArt: false };
  }
  // The art alone, a read name pulling its cards forward.
  const near = hits.filter((h) => h.distance <= ART_MAYBE);
  if (!near.length) return { matches: [], confident: false, byArt: true };
  const named = read && (read.name || read.words.size) ? near.filter((h) => nameFits(h.card, read)) : [];
  const pool = named.length ? named : near;
  const matches = pool
    .map((h) => ({ card: h.card, score: (ART_MAYBE - h.distance) / 4 + (read ? scoreCard(h.card, read) / 4 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  // A name read off the card that fits none of the near cards: the art is likely wrong.
  const nameDisagrees = !!read?.name && !named.length;
  // A number was read but no card has it (misread, or a print the catalog lacks): the art may be
  // a look-alike from another set, so the pick is the user's.
  const numberUnfound = !!read?.numbers.length;
  const sure = !nameDisagrees && !numberUnfound && artSure(named.length ? named : hits, art?.edge ?? false);
  return { matches, confident: sure && matches[0].card.productId === pool[0].card.productId, byArt: true };
}

/** A read with nothing but what the photo's text gave (maybe a name), for an art-only match. */
export function artRead(lines: (RecognizedLine | string)[], readName: (l: (RecognizedLine | string)[]) => string | null): ParsedCard {
  const words = new Set<string>();
  for (const l of lines) for (const w of (typeof l === 'string' ? l : l.text).toUpperCase().split(/[^A-Z0-9'é.-]+/i)) if (w.length >= 2) words.add(w);
  return { numbers: [], codes: [], language: null, words, name: readName(lines) };
}

