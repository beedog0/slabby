// Sealed product: booster boxes, ETBs, packs, tins and collection boxes from TCGplayer's catalog
// (0015_sealed.sql). A sealed item in the vault is a Card with `sealed` set and grader 'raw': it
// has no grade, number or cert, is shown as its product photo (never inside a slab), and is
// priced from the catalog's nightly TCGplayer market by its product id (src/services/comps.ts).

import type { SealedType } from '../types';

export const SEALED_TYPES: SealedType[] = [
  'booster_box',
  'etb',
  'booster_bundle',
  'booster_pack',
  'blister',
  'tin',
  'collection',
  'deck',
  'case',
];

const LABEL: Record<SealedType, string> = {
  booster_box: 'Booster box',
  etb: 'Elite Trainer Box',
  booster_bundle: 'Booster bundle',
  booster_pack: 'Booster pack',
  blister: 'Blister',
  tin: 'Tin',
  collection: 'Collection box',
  deck: 'Deck',
  case: 'Case',
};

/** "Booster box"; "Sealed" for a kind this build doesn't know yet. */
export function sealedLabel(t: string | null | undefined): string {
  return (t && LABEL[t as SealedType]) || 'Sealed';
}

export function isSealedType(t: unknown): t is SealedType {
  return typeof t === 'string' && (SEALED_TYPES as string[]).includes(t);
}

/** Search filter values for the Type group: singles, any sealed product, or one kind. */
export type TypeFilter = 'card' | 'sealed' | SealedType;

export function typeLabel(t: TypeFilter): string {
  if (t === 'card') return 'Cards';
  if (t === 'sealed') return 'All sealed';
  return sealedLabel(t);
}

/**
 * TCGplayer names sealed product with its set ("Surging Sparks Booster Box"); under a set heading
 * that repeats it. The vault keeps the full name so a box reads on its own.
 */
export function sealedName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}
