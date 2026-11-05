// Local-first vault. Seeded from mocks; Supabase sync lands in a later PR.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import cardsJson from '../mocks/cards.json';
import type { Card } from '../types';

type VaultState = {
  cards: Card[];
  update: (id: string, patch: Partial<Card>) => void;
  add: (card: Card) => void;
};

export const useVault = create<VaultState>()(
  persist(
    (set) => ({
      cards: cardsJson as Card[],
      update: (id, patch) =>
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      add: (card) => set((s) => ({ cards: [card, ...s.cards] })),
    }),
    { name: 'slabby.vault', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
