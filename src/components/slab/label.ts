// Label text from the card's data, as PSA prints it.
import type { Card } from '../../types';

const LANG: Record<string, string> = { ja: 'JPN', en: '', ko: 'KOR', zh: 'CHN' };

/** "2023 POKEMON JPN SV2a" */
export function labelSetLine(c: Card): string {
  return [c.year, 'POKEMON', LANG[c.language] ?? c.language.toUpperCase(), c.setCode]
    .filter(Boolean)
    .join(' ');
}

/** "MEW ex #205": species uppercased, suffixes (ex, V, VMAX…) kept as printed. */
export function labelNameLine(c: Card): string {
  const [first, ...rest] = c.name.split(' ');
  const keep = rest.filter((w) => !/^(alt|art|SAR|SIR)$/i.test(w));
  return [first.toUpperCase(), ...keep].join(' ') + (c.number ? ` #${c.number}` : '');
}
