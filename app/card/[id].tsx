// Slab detail: slab, value vs paid, price chart, comps row, and "Asking price" (with the lowest
// you'll take under it), which opens Before the table. The graded comps row opens Recent sales
// (card/[id]/sales.tsx). Sell sheet moves live in the … menu.
// Reference: 03-slab-detail.png. "More stats" (Phase 3) and the 1y range (needs history beyond
// 90 days) are left out until they have data behind them, so nothing here is a dead tap.

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { trendTint } from '../../src/components/MiniChart';
import { PriceChart } from '../../src/components/PriceChart';
import { shareSlab } from '../../src/components/share/ShareCard';
import { openSlabMenu } from '../../src/components/menu/Menu';
import { statusItems } from '../../src/components/collection/statusSheets';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { TrendSentence } from '../../src/components/TrendSentence';
import { CardAnalytics } from '../../src/components/search/CardAnalytics';
import { SaleLines } from '../../src/components/search/SaleLines';
import { BackIcon, Chevron, Hairline, IconButton } from '../../src/components/ui';
import { gradeLabel, money, rowTitle } from '../../src/lib/format';
import { GAMES, LANGUAGE_NAME, gameOf } from '../../src/lib/games';
import { detailFor } from '../../src/pricing/portfolio';
import { freshnessLine, trendSentence, trendVerdict } from '../../src/pricing/trend';
import { useCardRow } from '../../src/pricing/useCardRow';
import { useCardRefresh } from '../../src/services/useRefresh';
import { useVault } from '../../src/store/vault';
import { color, space, type } from '../../src/theme/tokens';

type Range = '30' | '90';


export default function SlabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  const [range, setRange] = useState<Range>('90');
  const [tilting, setTilting] = useState(false);
  const refresh = useCardRefresh(row?.card, { auto: true });

  if (!row) return null;
  const { card, price } = row;
  const days = range === '90' ? 90 : 30;
  const detail = detailFor(row, days);
  const forSale = card.plan === 'sell';
  const raw = card.grader === 'raw';
  const trend = price ? trendSentence(trendVerdict(price, days, { raw }), days, raw) : null;
  const fresh = price ? freshnessLine(price, { raw, state: refresh.pulling ? 'refreshing' : refresh.state }) : null;

  // Share, then status (for sale, hold, sold) and remove, each with its own confirm sheet.
  // Leaving the page happens before a removal: it has nothing to show once the slab is gone.
  const menu = () =>
    openSlabMenu(card, [[{ label: 'Share card', onPress: () => shareSlab(card) }], ...statusItems(card, { onRemoved: () => router.back() })]);

  // Pokémon is the default, so only other games are named.
  const game = gameOf(card) === 'pokemon' ? null : GAMES[gameOf(card)].name;
  const subtitle = [game, card.grader === 'raw' ? null : LANGUAGE_NAME[card.language] ?? card.language, gradeLabel(card.grader, card.grade, card.condition)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 pops a screen on a sideways swipe anywhere; keep that to the left edge here so a
          drag on the slab tilts it instead of going back. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView
        scrollEnabled={!tilting}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.pull} tintColor={color.secondary} />}
      >
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

        {raw ? null : <SaleLines price={price} style={styles.gutter} />}

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
              {trend ? <TrendSentence parts={trend} style={{ flexShrink: 1, textAlign: 'right' }} /> : null}
            </View>
            <Hairline />
            {price ? (
              <>
                <Pressable
                  accessibilityRole={raw ? undefined : 'button'}
                  accessibilityHint={raw ? undefined : 'Shows recent sales'}
                  disabled={raw}
                  onPress={() => router.push(`/card/${card.id}/sales`)}
                  style={({ pressed }) => [styles.compsArea, pressed && { opacity: 0.5 }]}
                >
                  <View style={styles.compsLine}>
                    <Text style={[type.body, { color: color.ink, fontWeight: '400', flexShrink: 1 }]}>
                      {raw
                        ? 'TCGplayer market'
                        : price.sales30d > 0
                          ? `${price.sales30d} eBay sales, 30 days`
                          : 'No eBay sales in 30 days'}
                    </Text>
                    <View style={styles.priceLink}>
                      <Text style={[type.body, { color: color.ink }]}>
                        {raw || price.sales30d === 0
                          ? money(price.marketCents)
                          : `${money(price.lowCents)}–${money(price.highCents).replace('$', '')}`}
                      </Text>
                      {raw ? null : <Chevron />}
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>
                    {fresh}
                  </Text>
                </Pressable>
                <Hairline />
              </>
            ) : null}
            {card.status === 'owned' && row.ask != null && row.floor != null ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Asking price ${money(row.ask)}, lowest you'll take ${money(row.floor)}`}
                  onPress={() => router.push(`/con/table/${card.id}`)}
                  style={({ pressed }) => [styles.compsRow, pressed && { opacity: 0.5 }]}
                >
                  <View style={{ gap: 2, flex: 1 }}>
                    <Text style={[type.body, { color: color.ink, fontWeight: '400' }]}>Asking price</Text>
                    <Text style={[type.secondary, { color: color.secondary }]}>
                      Lowest you'll take <Text style={{ color: color.loss }}>{money(row.floor)}</Text>
                    </Text>
                  </View>
                  <View style={styles.priceLink}>
                    <Text style={[type.body, { color: color.ink }]}>{money(row.ask)}</Text>
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
        {/* The search page's analytics, at this card's grade (raw for raw). */}
        <View style={styles.gutter}>
          <CardAnalytics card={card} />
        </View>
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
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m, paddingVertical: space.l },
  priceLink: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  compsArea: { paddingVertical: space.xl },
  compsLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m },
  compsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xl },
});
