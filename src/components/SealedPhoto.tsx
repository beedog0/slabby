// Sealed product (booster box, ETB, tin…) shown as its own TCGplayer photo, whole and upright,
// where a card would show its slab. No case, sleeve or frame around it: the box is the object.
// TCGplayer's product shots sit on white, so on the white canvas the box simply stands there,
// its bottom on the same floor line a slab's would be (and the swipe view's reflection).

import { View } from 'react-native';
import { ArtImage } from './ArtImage';
import type { Card } from '../types';

export function SealedPhoto({ card, width, height, sharp = false }: { card: Pick<Card, 'id' | 'name' | 'imageFrontUrl'>; width: number; height: number; sharp?: boolean }) {
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel={card.name}>
      {card.imageFrontUrl ? (
        <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} fit="contain" position="bottom" sharp={sharp} style={{ width, height }} />
      ) : null}
    </View>
  );
}
