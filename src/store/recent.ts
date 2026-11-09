// What you searched and opened lately, for the Search tab's landing. On this phone only: it's a
// convenience, not your collection, so it isn't saved to the account.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Found } from '../services/searchFilters';

export const MAX_QUERIES = 8;
export const MAX_VIEWED = 12;

type RecentState = {
  queries: string[];
  viewed: Found[];
  addQuery: (q: string) => void;
  addViewed: (card: Found) => void;
  clear: () => void;
  /** Recent searches only; Recently viewed stays. */
  clearQueries: () => void;
};

/** Pure: newest first, case-insensitively unique, capped. */
export function pushQuery(list: string[], q: string, max = MAX_QUERIES): string[] {
  const t = q.trim().replace(/\s+/g, ' ');
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}

/** Pure: newest first, one per card, capped. */
export function pushViewed(list: Found[], card: Found, max = MAX_VIEWED): Found[] {
  return [card, ...list.filter((c) => c.productId !== card.productId)].slice(0, max);
}

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      queries: [],
      viewed: [],
      addQuery: (q) => set((s) => ({ queries: pushQuery(s.queries, q) })),
      addViewed: (card) => set((s) => ({ viewed: pushViewed(s.viewed, card) })),
      clear: () => set({ queries: [], viewed: [] }),
      clearQueries: () => set({ queries: [] }),
    }),
    { name: 'slabby.recent', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
