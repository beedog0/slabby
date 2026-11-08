// Art type: a short list shared by every game, so the search Filter can ask "what kind of art"
// without knowing each game's rarity names. Derived from the catalog's TCGplayer rarity, the
// name tags TCGplayer adds ("(Alternate Art)", "(Full Art)", "(Parallel)") and the card number
// (a number past the set total, like 223/197, is a full art or a secret).
//
// The server keeps the same rule as a generated column (supabase/migrations/0020_art_type.sql).
// Change both together; src/lib/__tests__/artType.test.ts pins the cases.

import type { Game } from '../types';

export type ArtType = 'standard' | 'holo' | 'full_art' | 'alt_art' | 'illustration' | 'special_illustration' | 'secret' | 'promo';

/** Display order: plain to rarest, promos last. */
export const ART_TYPES: ArtType[] = ['standard', 'holo', 'full_art', 'alt_art', 'illustration', 'special_illustration', 'secret', 'promo'];

const LABEL: Record<ArtType, string> = {
  standard: 'Standard',
  holo: 'Holo',
  full_art: 'Full art',
  alt_art: 'Alt art',
  illustration: 'Illustration rare',
  special_illustration: 'Special illustration rare',
  secret: 'Secret and gold',
  promo: 'Promo',
};

export function artLabel(t: ArtType): string {
  return LABEL[t];
}

export function isArtType(t: unknown): t is ArtType {
  return typeof t === 'string' && (ART_TYPES as string[]).includes(t);
}

/** Which art types a game's catalog can have; the Filter shows only these when it has no counts. */
export const ART_TYPES_BY_GAME: Record<Game, ArtType[]> = {
  pokemon: ART_TYPES,
  onepiece: ['standard', 'full_art', 'alt_art', 'secret', 'promo'],
  riftbound: ['standard', 'alt_art', 'secret', 'promo'],
};

type Card = { game: Game | string; language?: string | null; rarity?: string | null; name: string; number?: string | null };

/** 223/197 → true: numbered past the set, so a full art or secret. */
function pastSetTotal(number: string | null | undefined): boolean {
  const m = /^\s*0*(\d+)\s*\/\s*0*(\d+)\s*$/.exec(number ?? '');
  return !!m && Number(m[1]) > Number(m[2]);
}

export function artTypeOf(c: Card): ArtType {
  const r = (c.rarity ?? '').trim().toLowerCase();
  const n = c.name.toLowerCase();
  const no = (c.number ?? '').trim().toLowerCase();

  // Signed and metal cards (Riftbound) are their own top chase, ahead of their Showcase rarity.
  if (/\((signature|metal)\b/.test(n)) return 'secret';

  // Alternate art, by name tag in every game: Pokémon "(Alternate Full Art)", "(Alternate Art
  // Secret)"; One Piece "(Alternate Art)", "(Parallel)", "(Manga)", "(SP)"; Riftbound "(Alternate
  // Art)", "(Overnumbered)" and its Showcase rarity.
  if (/\((alternate|alt\.?)\b[^)]*art|\((parallel|manga|overnumbered)\b/.test(n)) return 'alt_art';
  if (c.game === 'onepiece' && /\(sp\)/.test(n)) return 'alt_art';
  if (c.game === 'riftbound' && (r === 'showcase' || r === 'overnumbered')) return 'alt_art';

  if (/^(special illustration rare|special art rare|character super rare)$/.test(r)) return 'special_illustration';
  if (/^(illustration rare|art rare|character rare|character holo rare)$/.test(r) || /^trainer gallery/.test(r)) return 'illustration';
  if (c.game === 'pokemon' && /^(tg|gg)\d/.test(no)) return 'illustration';

  // Secret, hyper (gold), rainbow; One Piece SEC and TR (treasure); Pokémon's "(Secret)" tag on
  // older secret rares; Japanese UR and MUR are the gold cards.
  if (/secret|hyper|rainbow|gold|treasure/.test(r) || /^(sec|tr)$/.test(r) || /\(secret\)/.test(n)) return 'secret';
  if (c.game === 'pokemon' && c.language === 'ja' && /^(mega )?ultra rare$/.test(r)) return 'secret';

  if (r === 'promo' || r === 'pr') return 'promo';

  if (/\(full art\)/.test(n)) return 'full_art';
  if (c.game === 'pokemon') {
    if (c.language === 'ja' && /^(super rare|trainer rare)$/.test(r)) return 'full_art';
    if (r === 'shiny ultra rare') return 'full_art';
    if (r === 'ultra rare') return pastSetTotal(c.number) ? 'full_art' : 'holo';
    if (
      /holo|double rare|triple rare|ultra rare|radiant|kagayaku|shining|amazing|ace spec|ace rare|prism|break|shiny|rare ace|legend|lv\.x|pikachu rare|futuristic|mega attack|black white|rgb rare|classic collection/.test(
        r,
      )
    )
      return 'holo';
  }
  return 'standard';
}
