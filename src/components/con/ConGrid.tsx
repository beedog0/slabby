// Con mode's grid: two slabs across, like home's grid, captioned with what matters at a table:
// the ask and floor, market for trade only, or the sale price. Same taps as a con row.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bare, gradeLabel, money, rowTitle } from '../../lib/format';
import { dealsFor } from '../../pricing/deals';
import type { CardRow } from '../../pricing/portfolio';
import { useVault } from '../../store/vault';
import { space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { SlabView } from '../SlabView';
import { SelectOutline } from '../collection/SelectOutline';

const COLS = 2;
const GAP = space.l;

type Props = {
  rows: CardRow[];
  width: number;
  onPress: (r: CardRow) => void;
  onLongPress: (r: CardRow) => (() => void) | undefined;
  /** A brief wash behind a tile that just changed. */
  flash?: (id: string) => ReactNode;
  /** Picking cards (bundle, trade): the picked ones get the select outline. */
  selected?: Set<string>;
  /** Show market instead of the ask (the trade picker, which counts at market). */
  market?: boolean;
};

export function ConGrid({ rows, width, onPress, onLongPress, flash, selected, market }: Props) {
  const color = useColors();
  const deals = useVault((s) => dealsFor(s.cards));
  const cellW = Math.floor((width - GAP * (COLS - 1)) / COLS);
  const slabW = Math.floor(cellW * 0.82);
  return (
    <View style={styles.grid}>
      {rows.map((r) => (
        <View key={r.card.id} style={{ width: cellW }}>
          {flash?.(r.card.id)}
          <Pressable
            accessibilityRole="button"
            accessibilityState={selected ? { selected: selected.has(r.card.id) } : undefined}
            onPress={() => onPress(r)}
            onLongPress={onLongPress(r)}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
            <View style={styles.slab}>
              <View>
                <SlabView card={r.card} width={slabW} posed={false} />
                {selected ? <SelectOutline on={selected.has(r.card.id)} slabW={slabW} /> : null}
              </View>
            </View>
            <View style={{ width: slabW, alignSelf: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[type.text, { color: color.ink, fontWeight: '500' }]}>
                {rowTitle(r.card)}
              </Text>
              <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                {gradeLabel(r.card.grader, r.card.grade, r.card.condition, r.card.sealed)}
                {' · '}
                <PriceText row={r} market={market} />
              </Text>
              {!market && r.card.status === 'owned' && r.card.plan !== 'trade' && r.floor != null ? (
                <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                  floor {bare(r.floor)}
                </Text>
              ) : null}
              {r.card.status === 'sold' && deals.get(r.card.id)?.totalCents != null ? (
                <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                  of {money(deals.get(r.card.id)!.totalCents!)} deal
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function PriceText({ row, market }: { row: CardRow; market?: boolean }) {
  const color = useColors();
  const { card, price } = row;
  if (market) return <Text style={{ color: color.ink }}>{price ? money(price.marketCents) : 'no comps yet'}</Text>;
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
