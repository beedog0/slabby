// Share card: one slab on a white canvas with its name and label line, exported as a 4:5 image
// for posts or a table sign. The host is mounted once at the root; call shareSlab(card) anywhere.
// No prices on it: what you paid and what it's worth stay private.
// Several slabs share as one image: the same canvas with the slabs in a grid, name under each.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { gradeLabel, rowTitle } from '../../lib/format';
// The image is always light, whatever the app's appearance: it's posted and printed.
import { light as color, light, size, space, type } from '../../theme/tokens';
import { PaletteScope } from '../../theme/theme';
import type { Card } from '../../types';
import { SlabView } from '../SlabView';

const W = 360; // points; exported at 1080 px wide
const H = 450;

/** Most slabs one image holds: six rows of four still leaves each name readable. */
export const MAX_SHARE = 24;

let request: ((cards: Card[]) => void) | null = null;

/** Render the share card for this slab and open the share sheet. */
export function shareSlab(card: Card) {
  shareSlabs([card]);
}

/** One image with every slab on it (up to MAX_SHARE), then the share sheet. */
export function shareSlabs(cards: Card[]) {
  if (Platform.OS === 'web' || !cards.length) return;
  request?.(cards.slice(0, MAX_SHARE));
}

/** Grid for a group card: columns by count, slab width from the canvas, height grows with rows. */
export function groupLayout(n: number) {
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const inner = W - space.xl * 2;
  const cellW = Math.floor((inner - GROUP_GAP * (cols - 1)) / cols);
  const slabW = Math.floor(cellW * 0.86);
  const cellH = Math.ceil((slabW * size.heroH) / size.heroW) + CAPTION_H;
  const height = Math.max(H, space.xxl + rows * cellH + (rows - 1) * GROUP_GAP + MARK_H);
  return { cols, cellW, slabW, height };
}

const GROUP_GAP = space.l;
const CAPTION_H = 34;
const MARK_H = 56;

export function ShareCardHost() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const ref = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    request = setCards;
    return () => {
      request = null;
    };
  }, []);

  const card = cards?.length === 1 ? cards[0] : null;
  const group = cards && cards.length > 1 ? groupLayout(cards.length) : null;
  const height = group ? group.height : H;

  useEffect(() => {
    if (!cards) return;
    // One beat for layout and the card art to draw before the snapshot; more art takes longer.
    const t = setTimeout(async () => {
      try {
        const uri = await captureRef(ref as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, width: W * 3, height: height * 3 });
        await Share.share({ url: uri });
      } catch {
        Alert.alert('Couldn’t make the image', 'Try again in a moment.');
      } finally {
        setCards(null);
      }
    }, cards.length > 1 ? 900 : 400);
    return () => clearTimeout(t);
  }, [cards, height]);

  if (cards && group) {
    return (
      <PaletteScope palette={light}>
        <View pointerEvents="none" style={styles.offscreen}>
          <View ref={ref} collapsable={false} style={[styles.canvas, { height, paddingTop: space.xxl }]}>
            <View style={[styles.grid, { columnGap: GROUP_GAP, rowGap: GROUP_GAP }]}>
              {cards.map((c) => (
                <View key={c.id} style={{ width: group.cellW, alignItems: 'center' }}>
                  <SlabView card={c} width={group.slabW} posed={false} />
                  <Text numberOfLines={1} style={[type.caption, { color: color.ink, paddingTop: space.s, maxWidth: group.cellW }]}>
                    {rowTitle(c)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }} />
            <Text style={[type.caption, styles.mark]}>Slabby</Text>
          </View>
        </View>
      </PaletteScope>
    );
  }

  if (!card) return null;
  return (
    <PaletteScope palette={light}>
      <View pointerEvents="none" style={styles.offscreen}>
        <View ref={ref} collapsable={false} style={styles.canvas}>
          <View style={styles.slab}>
            {/* Straight on: the hero pose's turn (rotateY −7°, rotateX 3°) reads as a lean in a
                still photo, so the export faces the camera square and keeps only the shadow. */}
            <SlabView card={card} width={190} posed={false} shadow />
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
    </PaletteScope>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -W * 3, top: 0 },
  canvas: { width: W, height: H, backgroundColor: color.canvas, alignItems: 'center', paddingHorizontal: space.xl },
  slab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
  mark: { color: color.secondary, paddingTop: space.l, paddingBottom: space.xl },
});
