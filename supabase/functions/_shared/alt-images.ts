// Backup card pictures from TCGdex (https://tcgdex.dev: free, no key) for catalog cards TCGplayer
// has no picture for (0021_catalog_alt_images.sql). Pure helpers, no imports: runs unchanged in
// Deno (catalog-import) and Node (jest).
//
// Matching is by set code + card number only, within one language:
//   English  TCGplayer set code "WHT"  = TCGdex set abbreviation.official "WHT" (sv10.5w)
//   Japanese TCGplayer set code "SV2a" = TCGdex set id "SV2a"
// TCGdex lists a card's `image` only when it has one, so a match is always a real picture.

export type TcgdexSetBrief = { id: string; name?: string };
export type TcgdexSet = {
  id: string;
  abbreviation?: { official?: string | null } | null;
  tcgOnline?: string | null;
  cards?: { id?: string; localId: string; name?: string; image?: string | null }[];
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

/** Keys a TCGplayer set code can match for one TCGdex set in that language. */
export function setKeys(set: TcgdexSet, language: string): string[] {
  // Not tcgOnline: Silver Tempest's Trainer Gallery says "SIT" there and would shadow the main set.
  const key = norm(language === 'ja' ? set.id : set.abbreviation?.official);
  return key ? [key] : [];
}

/**
 * TCGplayer's card number as TCGdex writes the local id: "029/070" → "029", "TG01/TG30" → "TG01",
 * "SWSH001" stays. Leading zeros don't matter (TCGdex uses "001" for some sets, "1" for others).
 */
export function localKey(number: string | null | undefined): string {
  const head = norm(number).split('/')[0].trim();
  return /^\d+$/.test(head) ? String(Number(head)) : head.replace(/^([A-Z]+)0*(\d+)$/, '$1$2');
}

/** TCGdex image base → a JPEG URL. `high` is 600×825, `low` 245×337. */
export const tcgdexJpg = (image: string, quality: 'high' | 'low' = 'high') => `${image.replace(/\/$/, '')}/${quality}.jpg`;

/** Index one TCGdex set's pictures by local id. */
export function pictureIndex(set: TcgdexSet): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of set.cards ?? []) if (c.image) out.set(localKey(c.localId), tcgdexJpg(c.image));
  return out;
}

/** The TCGdex picture for one card, or null. */
export function tcgdexPicture(
  sets: Map<string, Map<string, string>>,
  card: { set_code: string | null; number: string | null },
): string | null {
  const pics = sets.get(norm(card.set_code));
  if (!pics || !card.number) return null;
  return pics.get(localKey(card.number)) ?? null;
}

/** TCGdex language code for one of our catalog languages (Pokémon only). */
export const tcgdexLang = (language: string) => (language === 'ja' ? 'ja' : language === 'en' ? 'en' : null);

// ---------------------------------------------------------------------------------------------
// Riftbound: Riot's own card gallery (https://playriftbound.com/en-us/card-gallery/). The page
// carries every card as JSON (Next.js __NEXT_DATA__) with a publicCode like "RAD-175/167",
// "SFD-227*/221" (signature), "RAD-R04a" (rune) or "UNL-T02" (token) and the card's picture on
// Riot's CDN. English only. TCGplayer misses pictures for signatures, runes, tokens and the
// organized-play promos (which reprint an Origins card under its Origins number, "257/298").

export type RiotCard = { publicCode?: string | null; name?: string | null; cardImage?: { url?: string | null } | null };
type RiotPic = { url: string; name: string };
export type RiotIndex = { bySet: Map<string, Map<string, RiotPic>>; setByTotal: Map<string, string> };

/** Card number as both sides compare it: "043a" → "43A", "R04a" → "R4A", "173*" stays "173*". */
export const riotLocal = (s: string) => norm(s).replace(/^([A-Z]*)0*(\d)/, '$1$2');

/** "RAD-173*\/167" → { set: 'RAD', local: '173*', total: '167' }. Null when it isn't a code. */
export function riotCode(code: string | null | undefined): { set: string; local: string; total: string | null } | null {
  const m = norm(code).match(/^([A-Z0-9]+)-([^/\s]+)(?:\/(\d+))?$/);
  return m ? { set: m[1], local: riotLocal(m[2]), total: m[3] ? String(Number(m[3])) : null } : null;
}

/** Pull the gallery's cards out of the page's __NEXT_DATA__ JSON, wherever the list sits. */
export function riotCardsFromPage(html: string): RiotCard[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let found: RiotCard[] = [];
  const walk = (o: unknown) => {
    if (found.length || !o || typeof o !== 'object') return;
    if (Array.isArray(o) && o.some((c) => c && typeof c === 'object' && 'publicCode' in c && 'cardImage' in c)) {
      found = o as RiotCard[];
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(JSON.parse(m[1]));
  return found;
}

/** Index the gallery by set code + number, and each set by its card total ("298" → OGN). */
export function riotIndex(cards: RiotCard[]): RiotIndex {
  const bySet = new Map<string, Map<string, RiotPic>>();
  const totals = new Map<string, Map<string, number>>();
  for (const c of cards) {
    const k = riotCode(c.publicCode);
    const url = c.cardImage?.url;
    if (!k || !url) continue;
    if (!bySet.has(k.set)) bySet.set(k.set, new Map());
    bySet.get(k.set)!.set(k.local, { url, name: (c.name ?? '').trim().toLowerCase() });
    if (k.total) {
      const t = totals.get(k.total) ?? new Map<string, number>();
      t.set(k.set, (t.get(k.set) ?? 0) + 1);
      totals.set(k.total, t);
    }
  }
  // A total belongs to the set that uses it most (sets never share one today).
  const setByTotal = new Map<string, string>();
  for (const [total, sets] of totals) setByTotal.set(total, [...sets].sort((a, b) => b[1] - a[1])[0][0]);
  return { bySet, setByTotal };
}

/**
 * Riot's picture for one TCGplayer Riftbound card, or null. Its own set first; a promo set
 * (OPP, PR…) borrows the main set its total names ("257/298" → OGN-257). A double token
 * ("T02 // T03") shows its first side. A signature ("173*") Riot hasn't posted yet shows the
 * same art without the signature (source 'riot_base'), never another card.
 */
export function riotPicture(
  index: RiotIndex,
  card: { set_code: string | null; number: string | null; name?: string | null },
): { url: string; source: 'riot' | 'riot_base' } | null {
  if (!card.number) return null;
  const [head, total] = card.number.split('//')[0].trim().split('/').map((s) => s.trim());
  if (!head) return null;
  const local = riotLocal(head);
  const own = norm(card.set_code);
  const byTotal = total && /^\d+$/.test(total) ? index.setByTotal.get(String(Number(total))) : undefined;
  const name = (card.name ?? '').toLowerCase();
  // Riot names a champion card by its title only ("Blind Monk" for "Lee Sin, Blind Monk"), so
  // the Riot name must sit inside the TCGplayer name. That also catches TCGplayer's odd number
  // (Jarvan IV's signature is listed as "179*", which is Aphelios on Riot's gallery).
  const fits = (p: RiotPic | undefined) => (p && p.name && name.includes(p.name) ? p.url : null);
  const look = (local: string) => fits(index.bySet.get(own)?.get(local)) ?? (byTotal ? fits(index.bySet.get(byTotal)?.get(local)) : null);
  const exact = look(local);
  if (exact) return { url: exact, source: 'riot' };
  const base = local.endsWith('*') ? look(local.replace(/\*+$/, '')) : null;
  return base ? { url: base, source: 'riot_base' } : null;
}
