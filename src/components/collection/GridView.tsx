// Two-across grid: flat slab, name, grade and value under each.

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { gradeLabel, money, pct, rowTitle } from '../../lib/format';
import { weekChange, type CardRow } from '../../pricing/portfolio';
import { dimmed, type SlabActions } from './actions';
import { CopiesMark, PinMark } from './PinMark';
import { SelectOutline } from './SelectOutline';
import { space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { SlabView } from '../SlabView';
import { slabLayout } from '../slab/geometry';

const COLS = 2;
const GAP = space.l;

export function GridView({ rows, width, actions }: { rows: CardRow[]; width: number; actions?: SlabActions }) {
  const cellW = Math.floor((width - GAP * (COLS - 1)) / COLS);
  const slabW = Math.floor(cellW * 0.82);
  // The clear case edge barely reads on white; the label is the edge the eye sees.
  const textW = slabW - slabLayout(slabW).frame * 2;
  return (
    <View style={styles.grid}>
      {rows.map((r) => (
        <Pressable
          key={r.card.id}
          accessibilityRole="button"
          accessibilityState={actions?.selected ? { selected: actions.selected.has(r.card.id) } : undefined}
          onPress={() => (actions?.onPress ? actions.onPress(r) : router.push(`/card/${r.card.id}`))}
          onLongPress={actions?.onLongPress ? () => actions.onLongPress!(r) : undefined}
          style={({ pressed }) => [{ width: cellW }, pressed && { opacity: 0.85 }, dimmed(actions, r) && { opacity: 0.35 }]}
        >
          <View style={styles.slab}>
            <View>
              <SlabView card={r.card} width={slabW} posed={false} />
              {actions?.pinnedId === r.card.id ? <PinMark slabW={slabW} card={r.card} /> : null}
              <CopiesMark slabW={slabW} card={r.card} copies={r.copies ?? 1} />
              <SelectOutline on={!!actions?.selected?.has(r.card.id)} slabW={slabW} />
            </View>
          </View>
          {/* Same width as the label, so the text lines up with its left edge. */}
          <View style={{ width: textW, alignSelf: 'center' }}>
            <Caption row={r} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function Caption({ row, center }: { row: CardRow; center?: boolean }) {
  const color = useColors();
  const { card, price } = row;
  const sold = card.status === 'sold';
  const value = sold ? card.soldCents : price?.marketCents;
  // Last 7 days of market movement, as "+3% this week". What you paid is on the card.
  const week = weekChange(row);
  const align = center ? 'center' : 'flex-start';
  return (
    <View style={{ gap: 2, alignItems: align }}>
      <Text numberOfLines={1} style={[type.text, { color: color.ink, fontWeight: '500' }]}>
        {rowTitle(card)}
      </Text>
      <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
        {gradeLabel(card.grader, card.grade, card.condition)}
        {' · '}
        <Text style={{ color: color.ink }}>{value != null ? money(value) : '—'}</Text>
        {sold ? ' sold' : ''}
      </Text>
      {/* Its own line so it never truncates; a blank line when there's nothing to say, so rows line up. */}
      <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
        {week ? (
          <>
            <Text style={{ color: week.cents >= 0 ? color.gain : color.loss }}>{pct(week.fraction)}</Text> this week
          </>
        ) : (
          ' '
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: space.xxl },
  slab: { alignItems: 'center', paddingBottom: space.m },
});
