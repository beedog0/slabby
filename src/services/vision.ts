// The photo fallback: when the on-device text reader can't place a photo, card-vision reads it
// (supabase/functions/card-vision). Shrunk to about 1200 px first, so the upload stays small.
// Null when it can't help: no backend (mocks), not set up yet, the daily cap, offline.

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fromVision, type PhotoRead, type VisionRead } from './photoScan';
import { supabase } from './supabase';

const SEND_W = 1200;

export async function readPhotoWithVision(uri: string): Promise<PhotoRead | null> {
  if (!supabase) return null;
  try {
    const small = await manipulateAsync(uri, [{ resize: { width: SEND_W } }], { compress: 0.75, format: SaveFormat.JPEG, base64: true });
    if (!small.base64) return null;
    const { data, error } = await supabase.functions.invoke<VisionRead>('card-vision', { body: { image: small.base64 } });
    if (error || !data) return null;
    return fromVision(data);
  } catch {
    return null;
  }
}
