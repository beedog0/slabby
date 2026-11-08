// Con mode row: thumb, name, sparkline, ask and floor. 74 pt tall.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bare, gradeLabel, money, promoTag, rowTitle } from '../lib/format';
import { CardName } from './CardName';
import type { CardRow } from '../pricing/portfolio';
import { color, size, space, type } from '../theme/tokens';
import { CardThumb } from './CardThumb';
import { Sparkline } from './Sparkline';

export function ConRow({ row, onPress, onLongPress }: { row: CardRow; onPress: () => void; onLongPress?: () => void }) {
  const { card, price } = row;
  const sold = card.status === 'sold';
  // Trade only isn't for cash, so it shows what the card is worth instead of an ask and floor.
  const trade = !sold && card.plan === 'trade';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} onLongPress={onLongPress} style={styles.row}>
      <CardThumb card={card} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <CardName name={rowTitle(card)} language={card.language} style={[type.body, { color: color.ink }]} />
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {[gradeLabel(card.grader, card.grade, card.condition), promoTag(card)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {price && !sold && !trade ? <Sparkline values={price.series90.slice(-30)} change={row.trend30} /> : null}
      <View style={styles.price}>
        <Text style={[type.rowPrice, { color: color.ink }]}>
          {sold ? money(card.soldCents ?? 0) : trade ? (price ? money(price.marketCents) : '—') : row.ask != null ? money(row.ask) : '—'}
        </Text>
        <Text style={[type.secondary, { color: color.secondary }]}>
          {sold ? 'sold' : trade ? 'trade only' : row.floor != null ? `floor ${bare(row.floor)}` : 'no comps yet'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { height: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m },
  price: { alignItems: 'flex-end', gap: 2, minWidth: 72 },
});
