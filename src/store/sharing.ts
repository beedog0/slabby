// How you show your collection to others: the order of your showcase, whether values show, and
// who can open it. Saved with the account (BACKED_UP in src/services/backup.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Audience, ShowcaseOrder } from '../profile/publicProfile';
import type { ImageOrder, WishTitle } from '../profile/shareImage';
import type { PerRow } from '../components/share/ShelfImage';

type SharingState = {
  order: ShowcaseOrder;
  /** Market values on your public profile and share image. Off: a collection's worth is private. */
  showValue: boolean;
  audience: Audience;
  /** Profile share image: which cards (an order, or your own pick), how many across, how many shelves. */
  imageOrder: ImageOrder;
  imageIds: string[];
  perRow: PerRow;
  rows: number;
  /** Wishlist share image: the title, whether prices show, and your picks in order (wishlist keys). */
  wishTitle: WishTitle;
  wishPrices: boolean;
  wishKeys: string[];
  wishPerRow: PerRow;
  /** What was last published to the showcases table. */
  published: string | null;
  set: (p: Partial<Omit<SharingState, 'set' | 'markPublished' | 'published'>>) => void;
  markPublished: (key: string) => void;
};

export const useSharing = create<SharingState>()(
  persist(
    (set) => ({
      order: 'value',
      showValue: false,
      audience: 'friends',
      imageOrder: 'value',
      imageIds: [],
      perRow: 3,
      rows: 2,
      wishTitle: 'buying',
      wishPrices: true,
      wishKeys: [],
      wishPerRow: 3,
      published: null,
      set: (p) => set(p),
      markPublished: (published) => set({ published }),
    }),
    { name: 'slabby.sharing', storage: createJSONStorage(() => AsyncStorage), version: 2, migrate: (old) => ({ ...(old as object), imageOrder: 'value', perRow: 3, rows: 2 }) as never },
  ),
);
