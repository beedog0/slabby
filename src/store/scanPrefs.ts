// Scan screen preferences, per device. The AI backup read (card-vision) is off unless switched
// on, so the on-device identification can be judged on its own.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ScanPrefs = {
  /** Photo mode: when the text read can't place a photo, ask card-vision. */
  aiBackup: boolean;
  setAiBackup: (on: boolean) => void;
};

export const useScanPrefs = create<ScanPrefs>()(
  persist(
    (set) => ({
      aiBackup: false,
      setAiBackup: (aiBackup) => set({ aiBackup }),
    }),
    { name: 'slabby.scan', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
