// Match imported rows (importCsv.ts) to our card catalog, then turn them into vault cards.
//
// A TCGplayer product id is an exact match. Otherwise search by name and number and keep a result
// only when the number agrees (when the row has one), the language agrees, and the set is the
// row's set when several printings share the number. Anything unsure stays unmatched: it still
// imports with the details from the file, and the server matches it like a card added by hand.

import type { Card, Game } from '../types';
import { cardFromDetails } from './psa';
import { uuid } from './sync';
import type { ImportRow } from './importCsv';
import { cardNumber, catalogCard, displayName, searchCards, type CatalogCard } from './search';

export type Matched = { row: ImportRow; card: CatalogCard | null };

const words = (s: string | null | undefined) =>
  new Set(
    (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !['the', 'and', 'of', 'pokemon', 'tcg', 'set', 'japanese', 'english', 'cards'].includes(w))
      // "Promos" and "Promo" are the same set.
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );

/** Share of the shorter name's words found in the other, 0 to 1. */
export function overlap(a: string | null | undefined, b: string | null | undefined): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  let n = 0;
  for (const w of small) if (big.has(w)) n++;
  return n / small.size;
}

const zeroless = (n: string | null) => cardNumber(n).replace(/^0+(?=\d)/, '').toLowerCase();
const sameNumber = (a: string | null, b: string | null) => !!zeroless(a) && zeroless(a) === zeroless(b);

/** Promo numbers written with or without the set's prefix: "031", "MEP031", "SVP 094", "SWSH031". */
const digits = (n: string | null) => cardNumber(n).match(/(\d+)[a-z]?$/i)?.[1].replace(/^0+(?=\d)/, '') ?? '';
const wholeNumber = (a: string | null, b: string | null) => {
  const parts = (n: string | null) => (n ?? '').toLowerCase().split('/').map((x) => x.trim().replace(/^0+(?=\d)/, ''));
  const [x, y] = [parts(a), parts(b)];
  return x.length === 2 && y.length === 2 && x[0] === y[0] && x[1] === y[1];
};
const looseNumber = (a: string | null, b: string | null) => !!digits(a) && digits(a) === digits(b);

// The catalog is English and Japanese only: a Korean or Chinese card never takes either's price.
// A file that doesn't say (Collectr) can match either; the set picks.
const langOk = (row: ImportRow, c: CatalogCard) =>
  row.language == null ? true : row.language === 'ja' ? c.language === 'ja' : row.language === 'en' && c.language !== 'ja';

/** TCGplayer set names lead with a code ("SV08: Surging Sparks", "M1S: Mega Symphonia"); other apps drop it. */
const bareSet = (s: string | null | undefined) => (s ?? '').replace(/^[^:]{1,12}:\s*/, '');
const norm = (s: string) => [...words(s)].join(' ');

/** How well the row's set names the catalog card's set: 2 exact, else word overlap 0 to 1, +1 for its code. */
export function setScore(rowSet: string | null, c: Pick<CatalogCard, 'setName' | 'setCode'>): number {
  if (!rowSet) return 0;
  if (norm(bareSet(rowSet)) === norm(bareSet(c.setName)) || norm(rowSet) === norm(c.setName)) return 2;
  return Math.max(overlap(rowSet, c.setName), overlap(rowSet, bareSet(c.setName))) + (c.setCode && words(rowSet).has(c.setCode.toLowerCase()) ? 1 : 0);
}

const variantOf = (name: string) => [...name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]).join(' ');
const core = (name: string) => displayName(name).replace(/\([^()]*\)/g, ' ').trim();

/**
 * Variant fit: "Marill (Friend Ball)" should take the Friend Ball print and plain "Marill" the plain
 * one. Words in brackets that are just the number ("Metagross (50)") don't count.
 */
function variantScore(rowName: string, catalogName: string): number {
  const strip = (v: string) => v.replace(/\b\d+\b/g, ' ').trim();
  const rv = strip(variantOf(rowName));
  const cv = strip(variantOf(displayName(catalogName)));
  if (!rv && !cv) return 0.5;
  if (!rv || !cv) return 0;
  return overlap(rv, cv);
}

/** The best catalog card for a row among search results, or null when none is a safe match. */
export function pick(row: ImportRow, found: CatalogCard[], byName = true): CatalogCard | null {
  let cands = found.filter((c) => langOk(row, c) && (!row.game || c.game === row.game));
  if (byName) cands = cands.filter((c) => overlap(core(row.name), core(c.name)) >= 0.6);
  if (row.number) {
    const strict = cands.filter((c) => sameNumber(row.number, c.number));
    // Promo prefixes differ between apps: accept the bare number only inside the row's own set.
    const loose = cands.filter((c) => !strict.includes(c) && looseNumber(row.number, c.number) && setScore(row.setName, c) >= 1);
    cands = [...strict, ...loose];
  }
  // The row names its set: keep cards from that set. One exception: a single card whose whole
  // printed number matches ("4/102" = "004/102"), when the other app names the set its own way.
  if (row.setName) {
    const inSet = cands.filter((c) => setScore(row.setName, c) >= 0.5);
    cands = inSet.length ? inSet : cands.length === 1 && wholeNumber(row.printedNumber, cands[0].number) ? cands : [];
  }
  if (!cands.length) return null;
  const scored = cands
    .map((c) => ({
      c,
      set: setScore(row.setName, c),
      s: 2 * setScore(row.setName, c) + variantScore(row.name, c.name) + (row.number && sameNumber(row.number, c.number) ? 0.25 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  const [best, next] = scored;
  const clear = !next || best.s > next.s;
  // Found by set and number alone: the set has to agree.
  if (!byName) return best.set >= 1 && clear ? best.c : null;
  // Without a number, the name alone isn't enough: the set has to agree too.
  if (!row.number && row.setName && best.set < 1) return null;
  return clear ? best.c : null;
}

export async function matchRow(row: ImportRow): Promise<CatalogCard | null> {
  if (row.language != null && row.language !== 'en' && row.language !== 'ja') return null;
  if (row.productId) {
    const c = await catalogCard(row.productId).catch(() => null);
    if (c) return c;
  }
  const name = core(row.name);
  const search = (q: string) => searchCards(q, row.game).catch(() => [] as CatalogCard[]);
  const hit = pick(row, await search(`${name} ${row.number ?? ''}`.trim()));
  if (hit) return hit;
  // A promo number written another way ("031" for "MEP031"), or no number: name and set.
  if (row.setName) {
    const bySet = pick(row, await search(`${name} ${bareSet(row.setName)}`));
    if (bySet) return bySet;
  }
  // Name spelled differently in the other app: the set and number still find it.
  if (!row.number || !row.setName) return null;
  return pick(row, await search(`${bareSet(row.setName)} ${row.number}`), false);
}

/** Match every row, a few at a time, reporting progress for the sheet's "Matching 40 of 120". */
export async function matchAll(rows: ImportRow[], onProgress?: (done: number) => void, width = 4): Promise<Matched[]> {
  const out: Matched[] = new Array(rows.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      out[i] = { row: rows[i], card: await matchRow(rows[i]) };
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, rows.length) }, worker));
  return out;
}

/** Vault cards for one matched row: one per copy. Matched rows take the catalog's name, set and photo. */
export function cardsFor(m: Matched, plan: Card['plan']): Card[] {
  const { row, card } = m;
  const game: Game = card?.game ?? row.game ?? 'pokemon';
  const base = cardFromDetails({
    game,
    cert: row.cert,
    grader: row.grader,
    grade: row.grade ?? 10,
    name: card ? displayName(card.name) : row.name,
    setName: card?.setName ?? row.setName ?? '',
    number: card ? cardNumber(card.number) : row.number ?? '',
    language: card ? (card.language === 'ja' ? 'ja' : 'en') : row.language ?? 'en',
    paidCents: row.paidCents,
    plan,
    setCode: card?.setCode ?? null,
    imageFrontUrl: card?.imageUrl ?? null,
  });
  const one: Card = {
    ...base,
    grade: row.grader === 'raw' ? null : base.grade,
    ...(row.condition ? { condition: row.condition } : {}),
    ...(row.printing && /reverse/i.test(row.printing) ? { finish: 'reverse' as const } : {}),
  };
  return Array.from({ length: row.quantity }, (_, i) => (i === 0 ? one : { ...one, id: uuid() }));
}
