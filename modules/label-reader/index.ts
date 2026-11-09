// On-device label text recognition (iOS, Apple Vision). Null where the native module isn't built
// in (web, Expo Go, Android in v1), so callers can hide the feature.

import { requireOptionalNativeModule } from 'expo-modules-core';

export type RecognizedLine = { text: string; x: number; y: number };
export type FoundCard = { rgb: string; width: number; height: number; found: boolean; quad: number[][] };

type LabelReaderModule = {
  /** minTextHeight: smallest text to read, as a share of the photo's height (Vision's default is 1/32). */
  recognize(uri: string, options?: { minTextHeight?: number }): Promise<RecognizedLine[]>;
  /**
   * The card in a photo, straightened, as RGB pixels (base64) for its art fingerprint
   * (src/services/artMatch.ts). region: the on-screen frame, 0..1 from the top-left. found is false
   * when no card edge was seen and the region (or the photo's middle) was used. Missing on builds
   * made before it existed.
   */
  findCard?(uri: string, options?: { region?: { x: number; y: number; width: number; height: number } }): Promise<FoundCard | null>;
  /** Delete a photo after reading it. Missing on builds made before it existed. */
  discard?(uri: string): void;
};

export const LabelReader = requireOptionalNativeModule<LabelReaderModule>('LabelReader');
