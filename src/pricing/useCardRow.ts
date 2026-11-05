import { useMemo } from 'react';
import { usePrices } from '../store/prices';
import { useRules } from '../store/rules';
import { useVault } from '../store/vault';
import { rowFor, type CardRow } from './portfolio';

/** The derived row for one card, recomputed when the card or the rules change. */
export function useCardRow(id: string | undefined): CardRow | null {
  const card = useVault((s) => s.cards.find((c) => c.id === id));
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  return useMemo(() => (card ? rowFor(card, rules) : null), [card, rules, prices]);
}
