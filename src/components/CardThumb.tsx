// 36×50 row thumbnail: a tiny slab (label strip + art) or a bare raw card.

import { View } from 'react-native';
import { ArtImage } from './ArtImage';
import { color, radius, shadow, size } from '../theme/tokens';
import type { Card } from '../types';

export function CardThumb({ card }: { card: Card }) {
  const art = card.artColor ?? color.well;
  if (card.grader === 'raw') {
    return (
      <View style={{ width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: art, overflow: 'hidden' }}>
        {card.imageFrontUrl ? <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} style={{ flex: 1 }} /> : null}
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
        {card.imageFrontUrl ? <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}
