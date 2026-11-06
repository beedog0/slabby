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

/** Derived rows for several cards (Select mode sheets), in the order of `ids`. */
export function useCardRows(ids: string[]): CardRow[] {
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const key = ids.join(',');
  return useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => rowFor(c, rules));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, rules, prices, key]);
}
