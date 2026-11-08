// Prices for cards with no price source: the AI estimate ("Find a price") and the price you typed
// yourself. Per phone, keyed by card_key, persisted so con mode has them with no signal. The
// server keeps estimates too (price_estimates, 7 days); this is the offline copy.
// Neither is a comp. priceFor() uses them only when a card has no real price, your own first.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Estimate } from '../../supabase/functions/_shared/estimate-math';

/** A search that found nothing still counts as searched, so the card doesn't offer it again for a week. */
export type EstimateEntry = { kind: 'found'; estimate: Estimate } | { kind: 'none'; foundAt: string };

type EstimatesState = {
  byKey: Record<string, EstimateEntry>;
  /** Your own price, US cents. */
  ownByKey: Record<string, number>;
  setEstimate: (key: string, entry: EstimateEntry) => void;
  setOwn: (key: string, cents: number | null) => void;
};

export const useEstimates = create<EstimatesState>()(
  persist(
    (set) => ({
      byKey: {},
      ownByKey: {},
      setEstimate: (key, entry) => set((s) => ({ byKey: { ...s.byKey, [key]: entry } })),
      setOwn: (key, cents) =>
        set((s) => {
          const ownByKey = { ...s.ownByKey };
          if (cents == null || cents <= 0) delete ownByKey[key];
          else ownByKey[key] = cents;
          return { ownByKey };
        }),
    }),
    { name: 'slabby.estimates', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
