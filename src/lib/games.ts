// The card games Slabby knows. Pokémon is the default: cards saved before games existed have no
// `game` and are Pokémon. Everything game-specific (label text, how PSA names the brand, which
// languages it prints in) lives here so screens and services don't branch on game names.

import type { Card, Game } from '../types';

export type GameInfo = {
  id: Game;
  /** How the app names the game. */
  name: string;
  /** What PSA prints on the slab label before the language and set: "2023 ONE PIECE JPN OP05". */
  labelBrand: string;
  /** Matches PSA's Brand field (and OCR'd label text) for this game, anchored at the start. */
  brand: RegExp;
  /** Languages it's printed in, most common first. */
  languages: string[];
  /** Placeholders for the add-by-hand form. */
  example: { name: string; set: string; number: string };
};

export const GAMES: Record<Game, GameInfo> = {
  pokemon: {
    id: 'pokemon',
    name: 'Pokémon',
    labelBrand: 'POKEMON',
    // OCR reads O as 0 and drops the accent; older labels abbreviate to "P.M.".
    brand: /^P(?:OK[EÉ]M[O0]N|\.?M\.?)\b\s*/i,
    languages: ['en', 'ja'],
    example: { name: 'Mew ex', set: '151', number: '205' },
  },
  onepiece: {
    id: 'onepiece',
    name: 'One Piece',
    labelBrand: 'ONE PIECE',
    // "ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA"
    brand: /^[O0]NE\s?P[I1]ECE\b(?:\s+CARD\s+GAME\b)?\s*/i,
    languages: ['en', 'ja'],
    example: { name: 'Monkey D. Luffy', set: 'OP05', number: '119' },
  },
  riftbound: {
    id: 'riftbound',
    name: 'Riftbound',
    labelBrand: 'RIFTBOUND',
    // "RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED"
    brand: /^R[I1]FTB[O0]UND\b:?(?:\s*LEAGUE\s+OF\s+LEGENDS\b)?(?:\s+(?:TCG|TRADING\s+CARD\s+GAME)\b)?\s*/i,
    languages: ['en', 'zh'],
    example: { name: 'Jinx', set: 'OGN', number: '001' },
  },
};

export const GAME_LIST: GameInfo[] = [GAMES.pokemon, GAMES.onepiece, GAMES.riftbound];

export const gameOf = (c: Pick<Card, 'game'>): Game => c.game ?? 'pokemon';

/** The game a PSA Brand (or the start of a label line) names, or null if none. */
export function gameFromBrand(brand: string): Game | null {
  const t = brand.trim();
  return GAME_LIST.find((g) => g.brand.test(t))?.id ?? null;
}

export const LANGUAGE_NAME: Record<string, string> = { ja: 'Japanese', en: 'English', ko: 'Korean', zh: 'Chinese' };
