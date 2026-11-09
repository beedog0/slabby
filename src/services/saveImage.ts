// Save a made image (share card, group card) to the camera roll. Asks only for add-only access,
// so Slabby never sees the rest of your photos.

import * as MediaLibrary from 'expo-media-library';

export type SaveResult = 'saved' | 'denied' | 'failed';

export async function saveImageToPhotos(uri: string): Promise<SaveResult> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return 'denied';
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'failed';
  }
}
