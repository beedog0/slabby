// Who this phone is signed in as, and how the last save to the account went (live, not saved).
// The holder (the account whose things this phone holds) is saved on its own: signing in to any
// other account merges (src/services/backup.ts) instead of pushing over it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AccountState = {
  /** Signed-in user id (a guest has one too). */
  uid: string | null;
  /** True while there's only a guest session: things live on this phone only. */
  guest: boolean;
  email: string | null;
  /** 'apple' or 'email' once signed in. */
  provider: string | null;
  savedAt: string | null;
  saving: boolean;
  error: string | null;
};

export const useAccount = create<AccountState>()(() => ({
  uid: null,
  guest: true,
  email: null,
  provider: null,
  savedAt: null,
  saving: false,
  error: null,
}));

const HOLDER = 'slabby.account.holder';

export async function getHolder(): Promise<string | null> {
  return AsyncStorage.getItem(HOLDER).catch(() => null);
}

export async function setHolder(uid: string): Promise<void> {
  await AsyncStorage.setItem(HOLDER, uid).catch(() => {});
}
