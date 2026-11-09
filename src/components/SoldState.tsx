// What Before the table and Offer show once a card is sold: the price, what you kept, the
// price line with the dot at the sale, "Back to con", and a quiet "Undo sale".

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { money } from '../lib/format';
import type { CardRow } from '../pricing/portfolio';
import { useVault } from '../store/vault';
import { backToCon } from './conStatusMenu';
import { size, space, type } from '../theme/tokens';
import { useColors } from '../theme/theme';
import { PriceLine, type Tick } from './PriceLine';
import { PrimaryButton } from './ui';

export function SoldState({ row, bottomInset }: { row: CardRow; bottomInset: number }) {
  const color = useColors();
  const update = useVault((s) => s.update);
  const { card, price } = row;
  const sold = card.soldCents ?? 0;
  const keeps = card.paidCents != null ? sold - card.paidCents : null;

  const ticks: Tick[] = [];
  if (card.paidCents) ticks.push({ value: card.paidCents, label: 'Paid', color: color.ink });
  if (row.floor != null) ticks.push({ value: row.floor, label: 'Floor', color: color.ink, labelColor: color.ink, height: 14 });
  if (price) ticks.push({ value: price.marketCents, label: 'Market', color: color.secondary });
  ticks.push({ value: sold, label: 'Sold', color: 'transparent', labelColor: color.ink, pin: true });

  const undo = () => update(card.id, { status: 'owned', soldCents: null, soldAt: null, soldWhere: null });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.body}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>Sold for</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayXL, { color: color.ink }]}>
            {money(sold)}
          </Text>
          {keeps != null ? (
            <Text style={[type.section, { color: color.secondary }]}>
              {keeps >= 0 ? 'Keeps ' : 'Loses '}
              <Text style={{ color: keeps >= 0 ? color.gain : color.loss }}>{money(Math.abs(keeps))}</Text>
            </Text>
          ) : null}
          {card.soldWhere ? (
            <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>at {card.soldWhere}</Text>
          ) : null}
        </View>
        {ticks.length > 1 ? <PriceLine ticks={ticks} fill={card.paidCents ? { from: card.paidCents, to: sold, color: color.ink } : undefined} dot={{ value: sold, color: color.ink }} /> : null}
      </View>
      <View style={[styles.footer, { paddingBottom: bottomInset + space.l }]}>
        <PrimaryButton title="Back to con" onPress={() => backToCon('sold', card.id)} />
        <Pressable accessibilityRole="button" onPress={undo} style={styles.quiet}>
          <Text style={[type.body, { color: color.ink }]}>Undo sale</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' },
  footer: { paddingHorizontal: space.gutter, gap: space.s },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
