// Display shelves: slabs three across, standing on a flat wood ledge. Tap a slab for its detail.

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { dimmed, type SlabActions } from './actions';
import { SelectOutline } from './SelectOutline';
import { color, shadow, size, space } from '../../theme/tokens';
import { SlabView } from '../SlabView';

const PER_ROW = 3;
const INSET = space.m; // slabs sit this far in from the ledge ends
const GAP = space.l;

export function ShelfView({ rows, width, actions }: { rows: CardRow[]; width: number; actions?: SlabActions }) {
  const slabW = Math.floor((width - INSET * 2 - GAP * (PER_ROW - 1)) / PER_ROW);
  const shelves: CardRow[][] = [];
  for (let i = 0; i < rows.length; i += PER_ROW) shelves.push(rows.slice(i, i + PER_ROW));

  return (
    <View style={{ gap: space.xxl }}>
      {shelves.map((shelf, i) => (
        <View key={i}>
          <View style={[styles.slabs, { minHeight: (slabW * size.heroH) / size.heroW }]}>
            {shelf.map((r) => (
              <Pressable
                key={r.card.id}
                accessibilityRole="button"
                accessibilityState={actions?.selected ? { selected: actions.selected.has(r.card.id) } : undefined}
                onPress={() => (actions?.onPress ? actions.onPress(r) : router.push(`/card/${r.card.id}`))}
                onLongPress={actions?.onLongPress ? () => actions.onLongPress!(r) : undefined}
                style={({ pressed }) => [pressed && { opacity: 0.85 }, dimmed(actions, r) && { opacity: 0.35 }]}
              >
                <SlabView card={r.card} width={slabW} posed={false} />
                <SelectOutline on={!!actions?.selected?.has(r.card.id)} slabW={slabW} />
              </Pressable>
            ))}
          </View>
          <Ledge />
        </View>
      ))}
    </View>
  );
}

export function Ledge() {
  return (
    <View style={shadow.shelf}>
      <View style={styles.top} />
      <View style={styles.front} />
    </View>
  );
}

const styles = StyleSheet.create({
  slabs: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: GAP,
    paddingHorizontal: INSET,
    marginBottom: -2, // slabs rest on the ledge, not above it
    zIndex: 1,
  },
  top: {
    height: size.shelfTop,
    backgroundColor: color.shelfTop,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  front: {
    height: size.shelfFront,
    backgroundColor: color.shelfFront,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
