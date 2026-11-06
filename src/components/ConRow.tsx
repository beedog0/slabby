// Con mode row: thumb, name, sparkline, ask and floor. 74 pt tall.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bare, gradeLabel, money, rowTitle } from '../lib/format';
import type { CardRow } from '../pricing/portfolio';
import { color, size, space, type } from '../theme/tokens';
import { CardThumb } from './CardThumb';
import { Sparkline } from './Sparkline';

export function ConRow({ row, onPress, onLongPress }: { row: CardRow; onPress: () => void; onLongPress?: () => void }) {
  const { card, price } = row;
  const sold = card.status === 'sold';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} onLongPress={onLongPress} style={styles.row}>
      <CardThumb card={card} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {rowTitle(card)}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {gradeLabel(card.grader, card.grade, card.condition)}
        </Text>
      </View>
      {price && !sold ? <Sparkline values={price.series90.slice(-30)} change={row.trend30} /> : null}
      <View style={styles.price}>
        <Text style={[type.rowPrice, { color: color.ink }]}>
          {sold ? money(card.soldCents ?? 0) : row.ask != null ? money(row.ask) : '—'}
        </Text>
        <Text style={[type.secondary, { color: color.secondary }]}>
          {sold ? 'sold' : row.floor != null ? `floor ${bare(row.floor)}` : 'no comps yet'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { height: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m },
  price: { alignItems: 'flex-end', gap: 2, minWidth: 72 },
});
