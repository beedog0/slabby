import { useVault } from '../store/vault';
import { dealsFor, type Deal } from './deals';

/** The deal this card sold in with others, if any. */
export function useDeal(cardId: string): Deal | undefined {
  return useVault((s) => dealsFor(s.cards).get(cardId));
}
