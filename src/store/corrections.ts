// Cards the user corrected after a scan ("Not this card?"), so the same read is never wrong twice.
// Per phone. Slab corrections also go to the server's card_refs (card-match), which every
// device and the nightly prices follow; this store makes the next raw scan of the card pick it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type CorrectionsState = {
  /** Read key (see correctionKey in services/cardScan) → TCGplayer product id. */
  byKey: Record<string, number>;
  remember: (key: string, productId: number) => void;
};

export const useCorrections = create<CorrectionsState>()(
  persist(
    (set) => ({
      byKey: {},
      remember: (key, productId) => set((s) => ({ byKey: { ...s.byKey, [key]: productId } })),
    }),
    { name: 'slabby.corrections', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
