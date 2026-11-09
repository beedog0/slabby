// Buying wishlist: cards you're hunting and the most you want to pay for each, by grade.
// Local-first on the phone, like the vault before sign-in. A Supabase table can sync it later.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Game } from '../types';

export type WishGrade = 'raw' | 'psa10' | 'psa9' | 'psa8' | 'psa7' | 'psa6' | 'psa5' | 'psa4' | 'psa3' | 'psa2' | 'psa1';

export type WishItem = {
  /** productId:grade, so one card can be wanted at two grades. */
  key: string;
  productId: number;
  grade: WishGrade;
  name: string;
  setName: string;
  number: string | null;
  imageUrl: string | null;
  game: Game;
  language: string;
  /** What you want to pay. */
  targetCents: number;
  /** True when you skipped typing a price and Slabby filled in your buying max. */
  autoTarget: boolean;
  /** Market for this grade when last checked, and the day. */
  marketCents: number | null;
  marketAsOf: string | null;
  /** How market for this grade moved over the 7 days before marketAsOf (0.04 = +4%), when known. */
  change7d?: number | null;
  addedAt: string;
};

export const wishKey = (productId: number, grade: WishGrade) => `${productId}:${grade}`;

type WishState = {
  items: WishItem[];
  put: (item: WishItem) => void;
  remove: (key: string) => void;
  /** Record a fresh market price after a card page or price check loaded. */
  seeMarket: (key: string, marketCents: number, asOf: string, change7d?: number | null) => void;
};

export const useWishlist = create<WishState>()(
  persist(
    (set) => ({
      items: [],
      put: (item) => set((s) => ({ items: [item, ...s.items.filter((i) => i.key !== item.key)] })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      seeMarket: (key, marketCents, asOf, change7d) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.key === key ? { ...i, marketCents, marketAsOf: asOf, ...(change7d !== undefined ? { change7d } : {}) } : i,
          ),
        })),
    }),
    { name: 'slabby.wishlist', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
