// PokemonPriceTracker client for Edge Functions. Key from the PPT_API_KEY secret.
// Docs: https://www.pokemonpricetracker.com/api-reference. Card ids are TCGplayer product ids.

import { bareNumber } from './comps-math.ts';

const BASE = 'https://www.pokemonpricetracker.com/api/v2';

export type PptCard = {
  tcgPlayerId: string;
  name: string;
  setName: string;
  cardNumber: string;
  imageCdnUrl400?: string;
  prices?: { market?: number | null; low?: number | null };
  priceHistory?: { conditions?: Record<string, { history: { date: string; market: number | null }[] }> };
  ebay?: { priceHistory?: Record<string, Record<string, { average: number; count: number }>> };
};

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${Deno.env.get('PPT_API_KEY')}` } });
  if (res.status === 429) throw new Error('ppt_rate_limited');
  if (!res.ok) throw new Error(`ppt_${res.status}`);
  return res.json();
}

const lang = (l: string) => (l === 'ja' ? 'japanese' : 'english');

const words = (t: string | null | undefined) =>
  (t ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE.has(w));
// Label and listing filler that never names a card (Fairmark's matcher uses the same idea).
const NOISE = new Set(['pokemon', 'japanese', 'card', 'cards', 'game', 'psa', 'bgs', 'cgc', 'gem', 'mint', 'mt', 'the', 'holo', 'promo']);

/** How well a PPT product fits the card: name words, then set code and set-name words. */
function score(d: PptCard, c: { name: string; setName: string | null; setCode?: string | null }): number {
  const name = new Set(words(d.name));
  const set = new Set(words(d.setName));
  let s = 0;
  for (const w of words(c.name)) if (name.has(w)) s += 2;
  if (c.setCode && words(d.setName).concat(words(d.name)).includes(c.setCode.toLowerCase())) s += 3;
  for (const w of words(c.setName)) if (set.has(w)) s += 1;
  return s;
}

/**
 * Find the TCGplayer product for a card. Searches by name (then by the bare species, since
 * labels print "MEW ex" or "CHARIZARD-HOLO"), keeps products whose card number matches, and picks
 * the best name and set fit. Null when nothing has the card number.
 */
export async function matchCard(c: { name: string; number: string | null; language: string; setName: string | null; setCode?: string | null }) {
  const want = bareNumber(c.number);
  const full = c.name.replace(/\b(alt art|SAR|SIR|AR)\b/gi, '').replace(/-HOLO\b/i, '').trim();
  const species = full.replace(/\b(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s*X|BREAK|delta)\b.*$/, '').trim();
  const tries = [...new Set([full, species].filter(Boolean))];
  for (const search of tries) {
    const body = (await get('/cards', { search, language: lang(c.language), limit: '100' })) as { data: PptCard[] };
    const hits = (body.data ?? []).filter((d) => !want || bareNumber(d.cardNumber) === want);
    if (!hits.length) continue;
    const best = hits.map((h) => ({ h, s: score(h, c) })).sort((x, y) => y.s - x.s)[0].h;
    const image = best.imageCdnUrl400 ?? `https://tcgplayer-cdn.tcgplayer.com/product/${best.tcgPlayerId}_400w.jpg`;
    return { tcgPlayerId: String(best.tcgPlayerId), image, setName: best.setName };
  }
  return null;
}

/** Price + 90 days of history (raw and graded) for one product. 3 credits. */
export async function fetchComps(tcgPlayerId: string, language: string): Promise<PptCard> {
  const body = (await get('/cards', {
    tcgPlayerId,
    language: lang(language),
    includeEbay: 'true',
    includeHistory: 'true',
    days: '120',
    maxDataPoints: '120',
  })) as { data: PptCard | PptCard[] };
  return Array.isArray(body.data) ? body.data[0] : body.data;
}
