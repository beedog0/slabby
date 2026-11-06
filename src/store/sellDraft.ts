// A scanned card on its way to being put up for sale: the scan sheet fills this in, the sell page
// (app/search/[id].tsx with ?sell=1, or app/sell.tsx when the card isn't in the catalog) reads it
// and saves the card on "Put up for sale". Not persisted: it only lives between those screens.

import { create } from 'zustand';
import { ask } from '../pricing/rules';
import { costBasis, type Cost } from '../pricing/sell';
import type { Card, PricingRules } from '../types';
import { useVault } from './vault';

export type SellDraft = {
  /** The card as it would be saved (cert, grade, photo), plan 'sell'. */
  card: Card;
  /** TCGplayer product id when the card is in our catalog; the page's analytics need it. */
  productId: number | null;
  /** The market the scan sheet showed (the chosen print's price for a raw card). */
  marketCents: number | null;
  askCents: number;
  cost: Cost | null;
  /** Runs once the card is saved: reuses the scan's card-match call for photo and prices. */
  afterSave?: (card: Card) => void;
};

type State = {
  draft: SellDraft | null;
  start: (d: SellDraft) => void;
  patch: (p: Partial<SellDraft>) => void;
  clear: () => void;
};

export const useSellDraft = create<State>()((set) => ({
  draft: null,
  start: (draft) => set({ draft }),
  patch: (p) => set((s) => (s.draft ? { draft: { ...s.draft, ...p } } : s)),
  clear: () => set({ draft: null }),
}));

/**
 * Save the drafted card for sale: plan 'sell', what it cost (a pull at its pack price, else $0),
 * and the ask as a per-card override unless it's exactly what the rules would ask.
 */
export function saveDraft(d: SellDraft, o: { cost: Cost | null; marketCents: number | null; rules: PricingRules }): Card {
  const ruleAsk = o.marketCents ? ask({ marketCents: o.marketCents, low30Cents: o.marketCents, rules: o.rules }) : null;
  const card: Card = {
    ...d.card,
    plan: 'sell',
    paidCents: costBasis(o.cost),
    askOverrideCents: ruleAsk === d.askCents ? null : d.askCents,
  };
  useVault.getState().add(card);
  d.afterSave?.(card);
  useSellDraft.getState().clear();
  return card;
}
