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

/** "MEW ex #205": species uppercased, suffixes (ex, V, VMAX…) kept as printed. */
export function labelNameLine(c: Card): string {
  const [first, ...rest] = c.name.split(' ');
  const keep = rest.filter((w) => !/^(alt|art|SAR|SIR)$/i.test(w));
  return [first.toUpperCase(), ...keep].join(' ') + (c.number ? ` #${c.number}` : '');
}
