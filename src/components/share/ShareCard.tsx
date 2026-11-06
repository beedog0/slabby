// Share card: one slab on a white canvas with its name and label line, exported as a 4:5 image
// for posts or a table sign. The host is mounted once at the root; call shareSlab(card) anywhere.
// No prices on it: what you paid and what it's worth stay private.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { gradeLabel, rowTitle } from '../../lib/format';
import { color, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { SlabView } from '../SlabView';

const W = 360; // points; exported at 1080 px wide
const H = 450;

let request: ((card: Card) => void) | null = null;

/** Render the share card for this slab and open the share sheet. */
export function shareSlab(card: Card) {
  if (Platform.OS === 'web') return;
  request?.(card);
}

export function ShareCardHost() {
  const [card, setCard] = useState<Card | null>(null);
  const ref = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    request = setCard;
    return () => {
      request = null;
    };
  }, []);

  useEffect(() => {
    if (!card) return;
    // One beat for layout and the card art to draw before the snapshot.
    const t = setTimeout(async () => {
      try {
        const uri = await captureRef(ref as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, width: W * 3, height: H * 3 });
        await Share.share({ url: uri });
      } catch {
        Alert.alert('Couldn’t make the image', 'Try again in a moment.');
      } finally {
        setCard(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [card]);

  if (!card) return null;
  return (
    <View pointerEvents="none" style={styles.offscreen}>
      <View ref={ref} collapsable={false} style={styles.canvas}>
        <View style={styles.slab}>
          <SlabView card={card} width={190} />
        </View>
        <Text numberOfLines={1} style={[type.section, { color: color.ink }]}>
          {rowTitle(card)}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>
          {[gradeLabel(card.grader, card.grade, card.condition), card.setName && !/^\d+$/.test(card.setName) ? card.setName : null, card.year]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text style={[type.caption, styles.mark]}>Slabby</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -W * 3, top: 0 },
  canvas: { width: W, height: H, backgroundColor: color.canvas, alignItems: 'center', paddingHorizontal: space.xl },
  slab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: space.xl },
  mark: { color: color.secondary, paddingTop: space.l, paddingBottom: space.xl },
});
