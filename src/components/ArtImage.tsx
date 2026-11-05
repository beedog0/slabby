// Card art from TCGplayer, sharp and cached. expo-image keeps decoded images in memory and on
// disk, so nothing reloads or goes soft while the carousel slides (the old RN Image re-fetched
// the 400 px art and showed it blurry until it decoded).

import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

/** The largest TCGplayer rendition (716×1000 for a card). Other URLs pass through. */
export function hiResArt(url: string): string {
  return url.replace(/_(?:\d+w|in_\d+x\d+)\.jpg$/, '_in_1000x1000.jpg');
}

/** Warm the cache for a list of art URLs (call when a screen with many slabs opens). */
export function prefetchArt(urls: (string | null | undefined)[]) {
  const list = [...new Set(urls.filter((u): u is string => !!u).map(hiResArt))];
  if (list.length) Image.prefetch(list, 'memory-disk').catch(() => {});
}

/** `sharp` keeps the full 1000 px decode instead of one sized to the view, so a zoomed-in
 *  slab is crisp on its first frame rather than sharpening a moment later. */
export function ArtImage({ uri, style, recyclingKey, sharp = false }: { uri: string; style?: StyleProp<ImageStyle>; recyclingKey?: string; sharp?: boolean }) {
  return (
    <Image
      source={{ uri: hiResArt(uri) }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={recyclingKey}
      priority="high"
      allowDownscaling={!sharp}
    />
  );
}
