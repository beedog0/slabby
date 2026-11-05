// Local-first vault, persisted on the phone. Synced by src/services/useSync.ts when signed in.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import cardsJson from '../mocks/cards.json';
import { supabase } from '../services/supabase';
import type { Card } from '../types';

type VaultState = {
  cards: Card[];
  update: (id: string, patch: Partial<Card>) => void;
  add: (card: Card) => void;
};

export const useVault = create<VaultState>()(
  persist(
    (set) => ({
      // Mock vault only when running without a backend; a real vault starts empty.
      cards: supabase ? [] : (cardsJson as Card[]),
      update: (id, patch) =>
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      add: (card) => set((s) => ({ cards: [card, ...s.cards] })),
    }),
    { name: 'slabby.vault', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
