// Scan preferences, per device. AI photo backup: when the on-device text reader can't place a
// photo, card-vision reads it instead. Off shows how well the on-device reading does on its own.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ScanPrefs = {
  aiPhoto: boolean;
  setAiPhoto: (on: boolean) => void;
};

export const useScanPrefs = create<ScanPrefs>()(
  persist(
    (set) => ({
      aiPhoto: true,
      setAiPhoto: (aiPhoto) => set({ aiPhoto }),
    }),
    { name: 'slabby-scan-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
