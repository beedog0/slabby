// Cached comps by card_key, persisted so con mode works with no signal on the show floor.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CardPrice } from '../services/comps';

type PricesState = {
  byKey: Record<string, CardPrice>;
  merge: (next: Record<string, CardPrice>) => void;
};

export const usePrices = create<PricesState>()(
  persist(
    (set) => ({
      byKey: {},
      merge: (next) => set((s) => ({ byKey: { ...s.byKey, ...next } })),
    }),
    { name: 'slabby.prices', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
