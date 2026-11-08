// The AI backup read: when the on-device reader can't place a photo, card-vision reads it
// (supabase/functions/card-vision). Shrunk to about 1200 px first, so the upload stays small.
// It never hangs the screen: the whole step gives up after VISION_TIMEOUT_MS.
// 'unavailable' means it couldn't answer (no backend, not set up, the daily cap, offline, too slow).

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fromVision, type PhotoRead, type VisionRead } from './photoScan';
import { supabase } from './supabase';

const SEND_W = 1200;
export const VISION_TIMEOUT_MS = 20_000;

export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

export function readPhotoWithVision(uri: string): Promise<PhotoRead | 'unavailable'> {
  const client = supabase;
  if (!client) return Promise.resolve('unavailable');
  const ask = async (): Promise<PhotoRead | 'unavailable'> => {
    const small = await manipulateAsync(uri, [{ resize: { width: SEND_W } }], { compress: 0.75, format: SaveFormat.JPEG, base64: true });
    if (!small.base64) return 'unavailable';
    const { data, error } = await client.functions.invoke<VisionRead>('card-vision', { body: { image: small.base64 }, timeout: VISION_TIMEOUT_MS });
    if (error || !data) return 'unavailable';
    return fromVision(data);
  };
  return withTimeout(ask(), VISION_TIMEOUT_MS, 'unavailable' as const);
}
