// A card opened from search: what it's worth raw and as a PSA 10, 9 or 8, one chart with a
// toggle, and one button to add it to the vault. Prices load on open (card-prices, cached a day).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trendTint } from '../../src/components/MiniChart';
import { PriceChart } from '../../src/components/PriceChart';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { money, pct } from '../../src/lib/format';
import { changeOver, type CardPrice } from '../../src/services/comps';
import {
  addParams,
  cardNumber,
  catalogCard,
  displayName,
  openPrices,
  type CatalogCard,
  type SearchGrade,
  type SearchPrices,
} from '../../src/services/search';
import { color, space, type } from '../../src/theme/tokens';
import type { Card } from '../../src/types';

type Choice = 'raw' | SearchGrade;
const GAME_NAME: Record<string, string> = { onepiece: 'One Piece', riftbound: 'Riftbound', pokemon: 'Pokémon' };

export default function SearchedCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [card, setCard] = useState<CatalogCard | null | undefined>(undefined);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  const [pick, setPick] = useState<Choice>('psa10');

  useEffect(() => {
    const productId = Number(id);
    catalogCard(productId).then(setCard).catch(() => setCard(null));
    openPrices(productId).then(setPrices).catch(() => setPrices(null));
  }, [id]);

  // Start on the first grade that has sales; raw when none do.
  useEffect(() => {
    if (!prices) return;
    const first = (['psa10', 'psa9', 'psa8'] as const).find((g) => prices.grades[g]);
    setPick(first ?? 'raw');
  }, [prices]);

  const slab = useMemo<Card | null>(() => (card ? slabFor(card, pick) : null), [card, pick]);

  if (card === undefined) return <View style={{ flex: 1, backgroundColor: color.canvas }} />;
  if (!card || !slab) {
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>
        <Text style={[type.text, styles.gutter, { color: color.secondary }]}>This card isn’t in the catalog anymore.</Text>
      </View>
    );
  }

  const price: CardPrice | null | undefined = prices === undefined ? undefined : pick === 'raw' ? prices?.raw : prices?.grades[pick];
  const series = price?.series90 ?? [];
  const no = cardNumber(card.number);
  const subtitle = [card.setName, no && `#${no}`, card.language === 'ja' ? 'JP' : null].filter(Boolean).join(' · ');
  const gradedMissing = card.game !== 'pokemon';

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 swipes back from anywhere; keep rightward drags on the price chart. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>

        <View style={styles.hero}>
          <SlabView card={slab} />
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={3} style={[type.title, { color: color.ink }]}>
              {displayName(card.name)}
            </Text>
            <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
              {subtitle}
            </Text>
          </View>
          <Text style={[type.title, { color: series.length > 1 ? trendTint(series) : color.ink }]}>
            {price ? money(price.marketCents) : '—'}
          </Text>
        </View>

        <View style={[styles.gutter, { paddingTop: space.xl }]}>
          <Segmented<Choice>
            value={pick}
            onChange={setPick}
            options={[
              { value: 'raw', label: 'Raw' },
              { value: 'psa10', label: 'PSA 10' },
              { value: 'psa9', label: 'PSA 9' },
              { value: 'psa8', label: 'PSA 8' },
            ]}
          />

          <View style={styles.chart}>
            {prices === undefined ? (
              <Text style={[type.text, { color: color.secondary }]}>Loading prices…</Text>
            ) : series.length > 1 ? (
              <PriceChart values={series} paidCents={null} width={width - space.gutter * 2} tint={trendTint(series)} asOf={price?.asOf} />
            ) : (
              <Text style={[type.text, { color: color.secondary }]}>{emptyLine(pick, prices, gradedMissing ? card.game : null)}</Text>
            )}
          </View>

          {price ? (
            <>
              <Hairline />
              {series.length > 1 ? (
                <>
                  <View style={styles.row}>
                    <Text style={[type.body, styles.label]}>Last 90 days</Text>
                    <Text style={[type.body, { color: changeOver(price, 89) >= 0 ? color.gain : color.loss }]}>
                      {pct(changeOver(price, 89))}
                    </Text>
                  </View>
                  <Hairline />
                </>
              ) : null}
              <View style={styles.row}>
                <Text style={[type.body, styles.label]}>
                  {pick === 'raw' ? 'TCGplayer market, 30 days' : `${price.sales30d} eBay sales, 30 days`}
                </Text>
                <Text style={[type.body, { color: color.ink }]}>
                  {price.lowCents === price.highCents
                    ? money(price.marketCents)
                    : `${money(price.lowCents)}–${money(price.highCents).replace('$', '')}`}
                </Text>
              </View>
              <Hairline />
            </>
          ) : null}
          {prices?.capped ? (
            <Text style={[type.secondary, { color: color.secondary, paddingTop: space.m }]}>
              Graded prices for new cards are paused until tomorrow to save credits for your scans.
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.gutter, { paddingBottom: insets.bottom + space.l, paddingTop: space.m }]}>
        <PrimaryButton title="Add to vault" onPress={() => router.push({ pathname: '/add', params: addParams(card, pick) })} />
      </View>
    </View>
  );
}

function emptyLine(pick: Choice, prices: SearchPrices | null, otherGame: string | null): string {
  if (!prices) return 'Prices aren’t reachable right now.';
  if (pick === 'raw') return prices.raw ? 'Price history starts once more days come in.' : 'No TCGplayer price for this card.';
  if (otherGame) return `Graded prices for ${GAME_NAME[otherGame] ?? otherGame} aren’t available yet.`;
  if (prices.capped && prices.source === 'catalog') return 'Graded prices load again tomorrow.';
  return `No ${pick.replace('psa', 'PSA ')} sales in the last 90 days.`;
}

/** A stand-in card for the slab render: the searched card at the picked grade, no cert. */
function slabFor(c: CatalogCard, pick: Choice): Card {
  return {
    id: `search-${c.productId}`,
    certNumber: null,
    grader: pick === 'raw' ? 'raw' : 'psa',
    grade: pick === 'raw' ? null : Number(pick.replace('psa', '')),
    name: displayName(c.name),
    setName: c.setName,
    setCode: c.setCode,
    number: cardNumber(c.number) || null,
    language: c.language,
    year: null,
    imageFrontUrl: c.imageUrl,
    paidCents: null,
    paidAt: null,
    plan: 'hold',
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: new Date(0).toISOString(),
  };
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  hero: { height: 330, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.m, paddingHorizontal: space.gutter },
  chart: { minHeight: 180, justifyContent: 'center', paddingVertical: space.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xl },
  label: { color: color.ink, fontWeight: '400' },
});
