// Slab detail: slab, value vs paid, price chart, comps row, and "Your price" (ask and lowest),
// which opens Before the table. Sell sheet moves live in the … menu.
// Reference: 03-slab-detail.png. "More stats" (Phase 3) and the 1y range (needs history beyond
// 90 days) are left out until they have data behind them, so nothing here is a dead tap.

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { trendTint } from '../../src/components/MiniChart';
import { PriceChart } from '../../src/components/PriceChart';
import { shareSlab } from '../../src/components/share/ShareCard';
import { openSlabMenu } from '../../src/components/menu/Menu';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { BackIcon, Chevron, Hairline, IconButton } from '../../src/components/ui';
import { gradeLabel, money, pct, rowTitle } from '../../src/lib/format';
import { detailFor } from '../../src/pricing/portfolio';
import { useCardRow } from '../../src/pricing/useCardRow';
import { useVault } from '../../src/store/vault';
import { color, space, type } from '../../src/theme/tokens';

type Range = '30' | '90';

const LANGUAGE: Record<string, string> = { ja: 'Japanese', en: 'English', ko: 'Korean', zh: 'Chinese' };

export default function SlabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  const [range, setRange] = useState<Range>('90');
  const [tilting, setTilting] = useState(false);

  if (!row) return null;
  const { card, price } = row;
  const days = range === '90' ? 90 : 30;
  const detail = detailFor(row, days);
  const forSale = card.plan === 'sell';

  const menu = () =>
    openSlabMenu(card, [
      {
        label: forSale ? 'Move to holds' : 'Add to sell sheet',
        onPress: () => update(card.id, { plan: forSale ? 'hold' : 'sell' }),
      },
      { label: 'Share card', onPress: () => shareSlab(card) },
    ]);

  const subtitle = [card.grader === 'raw' ? null : LANGUAGE[card.language] ?? card.language, gradeLabel(card.grader, card.grade, card.condition)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 pops a screen on a sideways swipe anywhere; keep that to the left edge here so a
          drag on the slab tilts it instead of going back. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView scrollEnabled={!tilting} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
          <IconButton label="More" onPress={menu}>
            <MoreIcon />
          </IconButton>
        </View>

        <View style={styles.hero}>
          <SlabView card={card} interactive onDragChange={setTilting} />
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
              {rowTitle(card)}
            </Text>
            <Text style={[type.text, { color: color.secondary }]}>{subtitle}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {/* The price stays ink: the market's direction is told by the chart and the trend line
                below it, so the only colored number here is your own gain or loss. */}
            <Text style={[type.title, { color: color.ink, fontVariant: ['tabular-nums'] }]}>
              {price ? money(price.marketCents) : '—'}
            </Text>
            {detail?.gainCents != null && card.paidCents != null ? (
              <Text style={[type.text, { color: color.secondary, fontVariant: ['tabular-nums'] }]}>
                <Text style={{ color: detail.gainCents >= 0 ? color.gain : color.loss }}>
                  {detail.gainCents >= 0 ? '+' : '−'}
                  {money(Math.abs(detail.gainCents))}
                </Text>
                {' · '}paid {money(card.paidCents)}
              </Text>
            ) : card.paidCents != null ? (
              <Text style={[type.text, { color: color.secondary }]}>paid {money(card.paidCents)}</Text>
            ) : null}
          </View>
        </View>

        {detail ? (
          <View style={styles.gutter}>
            <View style={{ paddingTop: space.xxl, paddingBottom: space.xl }}>
              <PriceChart
                values={detail.series}
                paidCents={card.paidCents}
                width={width - space.gutter * 2}
                tint={trendTint(detail.series)}
                asOf={price?.asOf}
              />
            </View>
            <Hairline />
            <View style={styles.rangeRow}>
              <Segmented<Range>
                style={{ width: 132 }}
                value={range}
                onChange={setRange}
                options={[
                  { value: '30', label: '30d' },
                  { value: '90', label: '90d' },
                ]}
              />
              <Text style={[type.text, { color: color.secondary }]}>
                <Text style={{ color: detail.change >= 0 ? color.gain : color.loss }}>{pct(detail.change)}</Text> over {days} days
              </Text>
            </View>
            <Hairline />
            {price && price.sales30d > 0 ? (
              <>
                <View style={styles.compsRow}>
                  <Text style={[type.body, { color: color.ink, fontWeight: '400' }]}>
                    {price.sales30d} {card.grader === 'raw' ? 'sales' : 'eBay sales'}, 30 days
                  </Text>
                  <Text style={[type.body, { color: color.ink }]}>
                    {money(price.lowCents)}–{money(price.highCents).replace('$', '')}
                  </Text>
                </View>
                <Hairline />
              </>
            ) : price && card.grader === 'raw' ? (
              <>
                <View style={styles.compsRow}>
                  <Text style={[type.body, { color: color.ink, fontWeight: '400' }]}>TCGplayer market, 30 days</Text>
                  <Text style={[type.body, { color: color.ink }]}>
                    {money(price.lowCents)}–{money(price.highCents).replace('$', '')}
                  </Text>
                </View>
                <Hairline />
              </>
            ) : null}
            {card.status === 'owned' && row.ask != null && row.floor != null ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/con/table/${card.id}`)}
                  style={({ pressed }) => [styles.compsRow, pressed && { opacity: 0.5 }]}
                >
                  <Text style={[type.body, { color: color.ink, fontWeight: '400' }]}>Your price</Text>
                  <View style={styles.priceLink}>
                    <Text style={[type.body, { color: color.ink }]}>
                      ask {money(row.ask)} · lowest {money(row.floor)}
                    </Text>
                    <Chevron />
                  </View>
                </Pressable>
                <Hairline />
              </>
            ) : null}
          </View>
        ) : (
          <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.xxl }]}>
            No comps yet for this card. Prices fill in when sales come in.
          </Text>
        )}
      </ScrollView>

    </View>
  );
}

function MoreIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={1.8} fill={color.ink} />
      <Circle cx={12} cy={12} r={1.8} fill={color.ink} />
      <Circle cx={19} cy={12} r={1.8} fill={color.ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.gutter - 10,
  },
  hero: { height: 330, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.m, paddingHorizontal: space.gutter },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.l },
  priceLink: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  compsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xl },
});
