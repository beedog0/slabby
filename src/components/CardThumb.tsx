// 36×50 row thumbnail: a tiny slab (label strip + art), a bare raw card, or a sealed box photo.

import { View } from 'react-native';
import { ArtImage } from './ArtImage';
import { radius, shadow, size } from '../theme/tokens';
import { useColors } from '../theme/theme';
import type { Card } from '../types';

export function CardThumb({ card }: { card: Card }) {
  const color = useColors();
  const art = card.artColor ?? color.well;
  if (card.sealed) {
    return (
      <View style={{ width: size.thumbW, height: size.thumbH }}>
        {card.imageFrontUrl ? <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} fit="contain" style={{ flex: 1 }} /> : null}
      </View>
    );
  }
  if (card.grader === 'raw') {
    return (
      <View style={{ width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: art, overflow: 'hidden' }}>
        {card.imageFrontUrl ? <ArtImage uri={card.imageFrontUrl} label={card.name} recyclingKey={card.id} style={{ flex: 1 }} /> : null}
      </View>
    );
  }
  return (
    <View
      style={[
        {
          width: size.thumbW,
          height: size.thumbH,
          borderRadius: radius.thumb,
          backgroundColor: color.canvas,
          padding: 3,
          gap: 2,
        },
        shadow.thumb,
      ]}
    >
      <View style={{ height: 8, backgroundColor: color.well }} />
      <View style={{ flex: 1, backgroundColor: art, overflow: 'hidden' }}>
        {card.imageFrontUrl ? <ArtImage uri={card.imageFrontUrl} label={card.name} recyclingKey={card.id} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}
