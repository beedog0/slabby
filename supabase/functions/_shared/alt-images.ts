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
