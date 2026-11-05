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

/**
 * Find the TCGplayer product for a card: search by name, then require the card number to match.
 * Returns null when nothing matches exactly; the card then stays without comps until edited.
 */
export async function matchCard(c: { name: string; number: string | null; language: string; setName: string | null }) {
  const species = c.name.replace(/\b(alt art|SAR|SIR)\b/gi, '').trim();
  const body = (await get('/cards', { search: species, language: lang(c.language), limit: '50' })) as { data: PptCard[] };
  const want = bareNumber(c.number);
  const hits = body.data.filter((d) => !want || bareNumber(d.cardNumber) === want);
  if (!hits.length) return null;
  // Prefer a set-name match when there are several (e.g. reprints).
  const set = c.setName?.toLowerCase();
  const best = (set && hits.find((h) => h.setName.toLowerCase().includes(set))) || hits[0];
  return { tcgPlayerId: best.tcgPlayerId, image: best.imageCdnUrl400 ?? null, setName: best.setName };
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
