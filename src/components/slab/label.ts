// Label text from the card's data, as PSA prints it.
import { GAMES, gameOf } from '../../lib/games';
import type { Card } from '../../types';

const LANG: Record<string, string> = { ja: 'JPN', en: '', ko: 'KOR', zh: 'CHN' };

/** "2023 POKEMON JPN SV2a", "2023 ONE PIECE JPN OP05", "2025 RIFTBOUND SFD" */
export function labelSetLine(c: Card): string {
  return [c.year, GAMES[gameOf(c)].labelBrand, LANG[c.language] ?? c.language.toUpperCase(), c.setCode]
    .filter(Boolean)
    .join(' ');
}

/** "SURFING PIKACHU VMAX #9", "MEW ex #205": PSA prints names in caps, except the lowercase "ex". */
export function labelNameLine(c: Card): string {
  const words = c.name
    .split(' ')
    .filter((w) => w && !/^(alt|art|SAR|SIR)$/i.test(w))
    .map((w) => (w === 'ex' ? w : w.toUpperCase()));
  return words.join(' ') + (c.number ? ` #${c.number}` : '');
}
