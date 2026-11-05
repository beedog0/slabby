// The printed back of the card, by language, for the slab's reverse side. Loaded once and
// kept in expo-image's disk cache. A language with no back yet shows a plain blue back.
// To bundle a back instead, drop it in assets/card-backs/ and point the entry at require(...).

import type { ImageSourcePropType } from 'react-native';

const EN = 'https://archives.bulbagarden.net/media/upload/1/17/Cardback.jpg'; // 745 × 1040

const BACKS: Record<string, string | ImageSourcePropType | null> = {
  en: EN,
  // Japanese backs differ from the international one; added once we have the image.
  ja: null,
  ko: null,
  zh: null,
};

export function cardBack(language: string): string | null {
  const b = BACKS[language] ?? null;
  return typeof b === 'string' ? b : null;
}
