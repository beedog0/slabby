// Trade calculator: the cards you'd give (vault ids) and the cards they'd give (searched cards at a
// grade, with the market price when added). Kept on the phone so a trade survives leaving the app
// mid-conversation; Clear starts the next one.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Game } from '../types';

export type TheirCard = {
  /** productId:grade, so the same card at two grades is two entries. */
  key: string;
  productId: number;
  /** 'raw' or 'psa10' … 'psa1'. */
  grade: string;
  name: string;
  setName: string;
  number: string | null;
  /** Set code, to find the same card in your vault (missing on trades saved before it). */
  setCode?: string | null;
  imageUrl: string | null;
  game: Game;
  language: string;
  marketCents: number;
};

type TradeState = {
  mine: string[];
  theirs: TheirCard[];
  toggleMine: (id: string) => void;
  addTheirs: (c: TheirCard) => void;
  removeTheirs: (key: string) => void;
  clear: () => void;
};

export const useTrade = create<TradeState>()(
  persist(
    (set) => ({
      mine: [],
      theirs: [],
      toggleMine: (id) => set((s) => ({ mine: s.mine.includes(id) ? s.mine.filter((m) => m !== id) : [...s.mine, id] })),
      addTheirs: (c) => set((s) => ({ theirs: [...s.theirs.filter((t) => t.key !== c.key), c] })),
      removeTheirs: (key) => set((s) => ({ theirs: s.theirs.filter((t) => t.key !== key) })),
      clear: () => set({ mine: [], theirs: [] }),
    }),
    { name: 'slabby.trade', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
