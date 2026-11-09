// How you show your collection to others: the order of your showcase, whether values show, and
// who can open it. Saved with the account (BACKED_UP in src/services/backup.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Audience, ShowcaseOrder } from '../profile/publicProfile';

type SharingState = {
  order: ShowcaseOrder;
  /** Market values on your public profile and share image. Off: a collection's worth is private. */
  showValue: boolean;
  audience: Audience;
  /** Slabs on the share image: 3, 6 or 9. */
  imageCount: number;
  /** What was last published to the showcases table. */
  published: string | null;
  set: (p: Partial<Pick<SharingState, 'order' | 'showValue' | 'audience' | 'imageCount'>>) => void;
  markPublished: (key: string) => void;
};

export const useSharing = create<SharingState>()(
  persist(
    (set) => ({
      order: 'value',
      showValue: false,
      audience: 'friends',
      imageCount: 6,
      published: null,
      set: (p) => set(p),
      markPublished: (published) => set({ published }),
    }),
    { name: 'slabby.sharing', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
