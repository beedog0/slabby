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

/** The game filter on home and in con mode: every game, or just one. */
export type GameFilter = Game | 'all';

/** The games present in these cards, in GAME_LIST order. */
export function gamesIn(cards: Pick<Card, 'game'>[]): Game[] {
  const seen = new Set(cards.map(gameOf));
  return GAME_LIST.filter((g) => seen.has(g.id)).map((g) => g.id);
}

/**
 * The filter actually in effect. A saved pick for a game that's no longer in the vault (or a vault
 * with one game, where the filter isn't shown) means every game, so nothing hides silently.
 */
export function effectiveGame(pick: GameFilter, present: Game[]): GameFilter {
  return pick !== 'all' && present.length > 1 && present.includes(pick) ? pick : 'all';
}

/** Keeps the rows whose card is in the picked game. */
export function inGame<T extends { card: Pick<Card, 'game'> }>(rows: T[], pick: GameFilter): T[] {
  return pick === 'all' ? rows : rows.filter((r) => gameOf(r.card) === pick);
}

/** What the filter button narrows to: a game, and optionally one set in it. */
export type CardPick = { game: GameFilter; set: string | null };
export const ALL_CARDS: CardPick = { game: 'all', set: null };
export type SetCount = { name: string; count: number };
/** What the filter button can offer for some cards: their games, and each game's sets. */
export type FilterMenu = { games: Game[]; counts: Partial<Record<Game, number>>; sets: Partial<Record<Game, SetCount[]>> };

/** Games and sets in these cards; sets with the most cards first, then by name. */
export function filterMenu(cards: Pick<Card, 'game' | 'setName'>[]): FilterMenu {
  const counts: Partial<Record<Game, number>> = {};
  const bySet: Partial<Record<Game, Map<string, number>>> = {};
  for (const c of cards) {
    const g = gameOf(c);
    counts[g] = (counts[g] ?? 0) + 1;
    const name = c.setName?.trim();
    if (!name) continue;
    const m = (bySet[g] ??= new Map());
    m.set(name, (m.get(name) ?? 0) + 1);
  }
  const games = GAME_LIST.filter((g) => counts[g.id]).map((g) => g.id);
  const sets: Partial<Record<Game, SetCount[]>> = {};
  for (const g of games) {
    sets[g] = [...(bySet[g] ?? new Map<string, number>())]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return { games, counts, sets };
}

/** The sets the menu offers under a pick's game (the only game's, in a one-game vault). */
export function setsFor(menu: FilterMenu, game: GameFilter): SetCount[] {
  const g = game !== 'all' ? game : menu.games.length === 1 ? menu.games[0] : null;
  return g ? (menu.sets[g] ?? []) : [];
}

/** True when there's something to filter: two games, or one game with two sets. */
export function hasChoices(menu: FilterMenu): boolean {
  return menu.games.length > 1 || setsFor(menu, 'all').length > 1;
}

/** The pick in effect: anything no longer in the cards falls back, so nothing hides silently. */
export function effectivePick(pick: CardPick, menu: FilterMenu): CardPick {
  const game = effectiveGame(pick.game, menu.games);
  const set = pick.set && setsFor(menu, game).some((s) => s.name === pick.set) ? pick.set : null;
  return { game, set };
}

/** Keeps the rows in the picked game and set. */
export function inPick<T extends { card: Pick<Card, 'game' | 'setName'> }>(rows: T[], pick: CardPick): T[] {
  const inG = inGame(rows, pick.game);
  return pick.set ? inG.filter((r) => r.card.setName?.trim() === pick.set) : inG;
}
