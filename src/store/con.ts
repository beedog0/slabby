// The active con session. One at a time; Supabase con_sessions sync comes with persistence.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ConSession = { id: string; name: string; startedAt: string };

/** What you're doing right now at the con. One switch drives con mode and Before the table. */
export type ConMode = 'sell' | 'buy';

/** The last con-day prep: which session, when it finished, and whether anything failed. */
export type ConPrep = { conId: string; at: string | null; failed: boolean };

type ConState = {
  session: ConSession | null;
  prep: ConPrep | null;
  setPrep: (p: ConPrep | null) => void;
  mode: ConMode;
  setMode: (m: ConMode) => void;
  start: (name: string) => void;
  end: () => void;
};

export const useCon = create<ConState>()(
  persist(
    (set) => ({
      session: null,
      prep: null,
      setPrep: (prep) => set({ prep }),
      mode: 'sell',
      setMode: (mode) => set({ mode }),
      start: (name) =>
        set({ session: { id: `con-${Date.now()}`, name, startedAt: new Date().toISOString() }, mode: 'sell' }),
      end: () => set({ session: null, prep: null }),
    }),
    {
      name: 'slabby.con',
      storage: createJSONStorage(() => AsyncStorage),
      // Prep is per app run: a run cut short by a quit starts over on the next launch.
      partialize: (s) => ({ session: s.session, mode: s.mode }),
    },
  ),
);

export const DEFAULT_CON_NAME = 'Collect-A-Con';
