// Display shelves: slabs and raw singles standing on a flat wood ledge (singles rest on it, not
// centred in the air above it), 1 to 5 per shelf (3 by default; set in
// Arrange shelf). Tap a slab for its detail.

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { dimmed, type SlabActions } from './actions';
import { CopiesMark, PinMark } from './PinMark';
import { SelectOutline } from './SelectOutline';
import { shadow, size, space } from '../../theme/tokens';
import { themed } from '../../theme/theme';
import { SlabView } from '../SlabView';

const INSET = space.m; // slabs sit this far in from the ledge ends
const GAP = space.l;
export const SHELF_GAP = space.xxl;
/** Fewer slabs per shelf make them bigger, up to this; then the row centres on the ledge. */
const MAX_SLAB_W = 200;

/** Slab size and where the first slab starts, for `perRow` slabs on a shelf `width` wide. */
export function shelfLayout(width: number, perRow: number) {
  const slabW = Math.min(MAX_SLAB_W, Math.floor((width - INSET * 2 - GAP * (perRow - 1)) / perRow));
  const rowW = perRow * slabW + (perRow - 1) * GAP;
  return { slabW, gap: GAP, left: Math.max(INSET, Math.floor((width - rowW) / 2)) };
}

export function ShelfView({
  rows,
  width,
  actions,
  perRow: PER_ROW = 3,
}: {
  rows: CardRow[];
  width: number;
  actions?: SlabActions;
  perRow?: number;
}) {
  const styles = useStyles();
  const { slabW, left } = shelfLayout(width, PER_ROW);
  const shelves: CardRow[][] = [];
  for (let i = 0; i < rows.length; i += PER_ROW) shelves.push(rows.slice(i, i + PER_ROW));

  return (
    <View style={{ gap: SHELF_GAP }}>
      {shelves.map((shelf, i) => (
        <View key={i}>
          <View style={[styles.slabs, { minHeight: (slabW * size.heroH) / size.heroW, paddingHorizontal: left }]}>
            {shelf.map((r) => (
              <Pressable
                key={r.card.id}
                accessibilityRole="button"
                accessibilityState={actions?.selected ? { selected: actions.selected.has(r.card.id) } : undefined}
                onPress={() => (actions?.onPress ? actions.onPress(r) : router.push(`/card/${r.card.id}`))}
                onLongPress={actions?.onLongPress ? () => actions.onLongPress!(r) : undefined}
                style={({ pressed }) => [pressed && { opacity: 0.85 }, dimmed(actions, r) && { opacity: 0.35 }]}
              >
                <View>
                  <SlabView card={r.card} width={slabW} posed={false} anchor="bottom" />
                  {actions?.pinnedId === r.card.id ? <PinMark slabW={slabW} card={r.card} anchor="bottom" /> : null}
                  <CopiesMark slabW={slabW} card={r.card} copies={r.copies ?? 1} anchor="bottom" />
                  <SelectOutline on={!!actions?.selected?.has(r.card.id)} slabW={slabW} />
                </View>
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
  const styles = useStyles();
  return (
    <View style={shadow.shelf}>
      <View style={styles.top} />
      <View style={styles.front} />
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  slabs: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: GAP,
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
}));
