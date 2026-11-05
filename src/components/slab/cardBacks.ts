// The printed back of the card, by game and language, for the slab's reverse side. Loaded once
// and kept in expo-image's disk cache. A back we don't have yet shows a plain back in the game's
// colour. To bundle a back instead, drop it in assets/card-backs/ and point the entry at require(...).

import type { ImageSourcePropType } from 'react-native';
import type { Game } from '../../types';

const POKEMON_EN = 'https://archives.bulbagarden.net/media/upload/1/17/Cardback.jpg'; // 745 × 1040

type Back = string | ImageSourcePropType | null;

const BACKS: Record<Game, { plain: string; byLanguage: Record<string, Back> }> = {
  pokemon: {
    plain: '#1D3F8F',
    // Japanese backs differ from the international one; added once we have the image.
    byLanguage: { en: POKEMON_EN, ja: null, ko: null, zh: null },
  },
  // One Piece and Riftbound print one back for every language. Images still to be sourced.
  onepiece: { plain: '#2A1E1A', byLanguage: {} },
  riftbound: { plain: '#14202E', byLanguage: {} },
};

export function cardBack(game: Game, language: string): string | null {
  const b = BACKS[game].byLanguage[language] ?? null;
  return typeof b === 'string' ? b : null;
}

/** The plain back colour shown until the printed back loads, or when there is none. */
export function cardBackPlain(game: Game): string {
  return BACKS[game].plain;
}
