// Card art (TCGplayer, or the catalog's backup picture), sharp and cached. expo-image keeps decoded images in memory and on
// disk, so nothing reloads or goes soft while the carousel slides (the old RN Image re-fetched
// the 400 px art and showed it blurry until it decoded).

import { Image, type ImageLoadEventData, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp } from 'react-native';
import { useColors } from '../theme/theme';
import { type } from '../theme/tokens';

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
export function ArtImage({
  uri,
  style,
  recyclingKey,
  sharp = false,
  fit = 'cover',
  position,
  onLoad,
  label,
  landscape,
}: {
  /** Null or a picture that fails to load (TCGplayer has none yet) shows the placeholder. */
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  recyclingKey?: string;
  sharp?: boolean;
  /** 'contain' never crops (raw singles, whose scans vary in aspect). */
  fit?: 'cover' | 'contain';
  /** Where a contained image sits: 'bottom' stands a sealed box on the floor line. */
  position?: 'center' | 'bottom';
  onLoad?: (e: ImageLoadEventData) => void;
  /** The card's name, for the placeholder's initial. */
  label?: string | null;
  /** A card printed landscape (Riftbound battlefields): laid sideways in the box, upright. */
  landscape?: boolean;
}) {
  // Remember which picture failed, so a recycled row with a new uri tries again.
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) return <NoPicture label={label} style={style} />;
  if (landscape)
    return <LandscapeArt uri={uri} style={style} recyclingKey={recyclingKey} onError={() => setFailed(uri)} onLoad={onLoad} />;
  return (
    <Image
      source={{ uri: hiResArt(uri) }}
      style={style}
      contentFit={fit}
      contentPosition={position}
      onLoad={onLoad}
      onError={() => setFailed(uri)}
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={recyclingKey}
      priority="high"
      allowDownscaling={!sharp}
    />
  );
}

/**
 * A landscape card in a portrait box: as wide as the box, centred. TCGplayer scans battlefields
 * standing up (the text runs bottom to top), so a portrait file is turned a quarter clockwise; a
 * landscape file (Riot's gallery) is shown as it is. Hidden until loaded, when its shape is known.
 */
function LandscapeArt({
  uri,
  style,
  recyclingKey,
  onError,
  onLoad,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  recyclingKey?: string;
  onError: () => void;
  onLoad?: (e: ImageLoadEventData) => void;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [shape, setShape] = useState<{ uri: string; w: number; h: number } | null>(null);
  const known = shape?.uri === uri ? shape : null;
  const turn = !!known && known.h > known.w;
  // The card's long side over its short side; 88/63 until the file has loaded.
  const ratio = known ? Math.max(known.w, known.h) / Math.min(known.w, known.h) : 88 / 63;
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;
  const cardH = Math.min(w / ratio, h);
  const cardW = cardH * ratio;
  // Before turning, the picture stands cardH wide and cardW tall.
  const imgW = turn ? cardH : cardW;
  const imgH = turn ? cardW : cardH;
  return (
    <View
      style={[StyleSheet.flatten(style as never), { overflow: 'hidden' }]}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box ? (
        <Image
          source={{ uri: hiResArt(uri) }}
          style={{
            position: 'absolute',
            width: imgW,
            height: imgH,
            left: (w - imgW) / 2,
            top: (h - imgH) / 2,
            opacity: known ? 1 : 0,
            borderRadius: (StyleSheet.flatten(style as never) as ImageStyle | undefined)?.borderRadius ?? 0,
            transform: turn ? [{ rotate: '90deg' }] : [],
          }}
          contentFit="contain"
          onLoad={(e) => {
            setShape({ uri, w: e.source.width, h: e.source.height });
            onLoad?.(e);
          }}
          onError={onError}
          cachePolicy="memory-disk"
          transition={0}
          recyclingKey={recyclingKey}
        />
      ) : null}
    </View>
  );
}

/** "Lugia V - 2023 (Gabriel Fernandez)" → "L". Null when there is no letter or digit to show. */
export function cardInitial(label: string | null | undefined): string | null {
  const m = (label ?? '').replace(/\([^)]*\)/g, '').match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : null;
}

/**
 * A card with no picture: the well, the name's initial large and quiet, and "No picture yet"
 * once there is room for it. Flat, no border, no icon.
 */
function NoPicture({ label, style }: { label?: string | null; style?: StyleProp<ImageStyle> }) {
  const color = useColors();
  const [w, setW] = useState(0);
  const initial = cardInitial(label);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  return (
    <View
      onLayout={onLayout}
      accessibilityLabel="No picture yet"
      style={[StyleSheet.flatten(style as never), { backgroundColor: color.well, alignItems: 'center', justifyContent: 'center' }]}
    >
      {initial && w > 0 ? (
        <Text allowFontScaling={false} style={{ ...type.displayM, fontSize: Math.round(w * 0.38), lineHeight: Math.round(w * 0.46), color: color.ghost }}>
          {initial}
        </Text>
      ) : null}
      {w >= 110 ? (
        <Text numberOfLines={1} style={[type.caption, { color: color.secondary, position: 'absolute', bottom: Math.round(w * 0.1) }]}>
          No picture yet
        </Text>
      ) : null}
    </View>
  );
}
