// Con mode's grid: two slabs across, like home's grid, captioned with what matters at a table:
// the ask and floor, market for trade only, or the sale price. Same taps as a con row.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bare, gradeLabel, money, rowTitle } from '../../lib/format';
import type { CardRow } from '../../pricing/portfolio';
import { color, space, type } from '../../theme/tokens';
import { SlabView } from '../SlabView';

const COLS = 2;
const GAP = space.l;

type Props = {
  rows: CardRow[];
  width: number;
  onPress: (r: CardRow) => void;
  onLongPress: (r: CardRow) => (() => void) | undefined;
  /** A brief wash behind a tile that just changed. */
  flash: (id: string) => ReactNode;
};

export function ConGrid({ rows, width, onPress, onLongPress, flash }: Props) {
  const cellW = Math.floor((width - GAP * (COLS - 1)) / COLS);
  const slabW = Math.floor(cellW * 0.82);
  return (
    <View style={styles.grid}>
      {rows.map((r) => (
        <View key={r.card.id} style={{ width: cellW }}>
          {flash(r.card.id)}
          <Pressable
            accessibilityRole="button"
            onPress={() => onPress(r)}
            onLongPress={onLongPress(r)}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
            <View style={styles.slab}>
              <SlabView card={r.card} width={slabW} posed={false} />
            </View>
            <View style={{ width: slabW, alignSelf: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[type.text, { color: color.ink, fontWeight: '500' }]}>
                {rowTitle(r.card)}
              </Text>
              <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                {gradeLabel(r.card.grader, r.card.grade, r.card.condition, r.card.sealed)}
                {' · '}
                <PriceText row={r} />
              </Text>
              {r.card.status === 'owned' && r.card.plan !== 'trade' && r.floor != null ? (
                <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                  floor {bare(r.floor)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function PriceText({ row }: { row: CardRow }) {
  const { card, price } = row;
  if (card.status === 'sold') {
    return (
      <>
        <Text style={{ color: color.ink }}>{money(card.soldCents ?? 0)}</Text> sold
      </>
    );
  }
  if (card.plan === 'trade') {
    return (
      <>
        <Text style={{ color: color.ink }}>{price ? money(price.marketCents) : '—'}</Text> trade
      </>
    );
  }
  if (row.ask == null) return <Text>no comps yet</Text>;
  return <Text style={{ color: color.ink }}>{money(row.ask)}</Text>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: space.xxl },
  slab: { alignItems: 'center', paddingBottom: space.m },
});
