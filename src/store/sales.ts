// Last recent-sales answer per card_key and window, persisted so the sales screen shows something
// with no signal on the show floor.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SalesResult } from '../types';

export type CachedSales = { result: SalesResult; fetchedAt: string };

type SalesState = {
  byKey: Record<string, CachedSales>;
  put: (key: string, entry: CachedSales) => void;
};

export const useSalesCache = create<SalesState>()(
  persist(
    (set) => ({
      byKey: {},
      put: (key, entry) => set((s) => ({ byKey: { ...s.byKey, [key]: entry } })),
    }),
    { name: 'slabby.sales', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
