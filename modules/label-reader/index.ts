// On-device label text recognition (iOS, Apple Vision). Null where the native module isn't built
// in (web, Expo Go, Android in v1), so callers can hide the feature.

import { requireOptionalNativeModule } from 'expo-modules-core';

export type RecognizedLine = { text: string; x: number; y: number };

type LabelReaderModule = {
  /** minTextHeight: smallest text to read, as a share of the photo's height (Vision's default is 1/32). */
  recognize(uri: string, options?: { minTextHeight?: number }): Promise<RecognizedLine[]>;
  /** Delete a photo after reading it. Missing on builds made before it existed. */
  discard?(uri: string): void;
};

export const LabelReader = requireOptionalNativeModule<LabelReaderModule>('LabelReader');
