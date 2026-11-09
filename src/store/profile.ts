// Your profile: the name, @handle, short bio and photo that sharing a profile and finding friends
// will show. Lives on the phone like everything else and is saved to the account with the rest
// (BACKED_UP in src/services/backup.ts); once signed in it is also published to the profiles table
// (0029_profiles.sql), where handles are unique, so friends can find you by handle later.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Profile = {
  name: string;
  /** Lowercase, without the @. Empty until you pick one. */
  handle: string;
  bio: string;
  /** A small square JPEG as a data URI, so it travels with the account to a new phone. */
  photo: string | null;
};

type ProfileState = Profile & {
  /** What was last published to the profiles table, so an unchanged profile isn't sent again. */
  published: string | null;
  save: (p: Profile) => void;
  markPublished: (key: string) => void;
};

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const BIO_MAX = 120;
export const NAME_MAX = 40;

/** Pure: what you typed, as a handle. Drops the @, spaces and anything a link can't carry. */
export function cleanHandle(typed: string): string {
  return typed
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, HANDLE_MAX);
}

/** Pure: why a handle can't be used, or null when it can. An empty handle is allowed (none yet). */
export function handleProblem(handle: string): string | null {
  if (!handle) return null;
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} letters or numbers.`;
  if (/^[._]|[._]$/.test(handle)) return 'Start and end with a letter or number.';
  if (/[._]{2}/.test(handle)) return 'No two dots or underscores in a row.';
  return null;
}

/** Pure: the letter shown when there's no photo. */
export function initialOf(name: string, handle: string, email?: string | null): string {
  const from = name.trim() || handle || email?.trim() || '';
  return (from.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase();
}

export const publishKey = (p: Profile) => JSON.stringify([p.handle, p.name.trim(), p.bio.trim(), p.photo]);

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      handle: '',
      bio: '',
      photo: null,
      published: null,
      save: (p) => set({ name: p.name.trim(), handle: p.handle, bio: p.bio.trim(), photo: p.photo }),
      markPublished: (published) => set({ published }),
    }),
    { name: 'slabby.profile', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
