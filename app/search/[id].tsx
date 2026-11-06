// A card opened from search: what it's worth raw and as a PSA 10 to 1, one chart, and one button
// to add it to the vault. 10/9/8 sit on the toggle; 7 to 1 sit behind "7–1" because most cards
// sell those grades rarely. All grades come from the same price call (card-prices, cached a day),
// so picking a lower grade costs nothing. In con mode (?con=1) it also shows what to pay.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  buyPrices,
  cardNumber,
  catalogCard,
  displayName,
  firstGrade,
  firstLowGrade,
  gradeLabel,
  isQuiet,
  LOW_GRADES,
  openPrices,
  type CatalogCard,
  type SearchGrade,
  type SearchPrices,
} from '../../src/services/search';
import { useRules } from '../../src/store/rules';
import { color, size, space, type } from '../../src/theme/tokens';
import type { Card } from '../../src/types';

type Choice = 'raw' | SearchGrade;
type Tab = 'raw' | 'psa10' | 'psa9' | 'psa8' | 'low';
const GAME_NAME: Record<string, string> = { onepiece: 'One Piece', riftbound: 'Riftbound', pokemon: 'Pokémon' };
const isLow = (c: Choice) => (LOW_GRADES as readonly string[]).includes(c);
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function SearchedCard() {
  const { id, con } = useLocalSearchParams<{ id: string; con?: string }>();
  const buying = con === '1';
  const rules = useRules((s) => s.rules);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [card, setCard] = useState<CatalogCard | null | undefined | 'error'>(undefined);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  const [pick, setPick] = useState<Choice>('psa10');
  const touched = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const productId = Number(id);
    setCard(undefined);
    setPrices(undefined);
    catalogCard(productId)
      .then((c) => live && setCard(c))
      .catch(() => live && setCard('error'));
    openPrices(productId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  // Open on the first grade with sales, unless the user already tapped one while prices loaded.
  useEffect(() => {
    if (prices && !touched.current) setPick(firstGrade(prices));
  }, [prices]);

  const choose = useCallback(
    (c: Choice) => {
      touched.current = true;
      setPick(c);
    },
    [],
  );
  const onTab = (t: Tab) => choose(t === 'low' ? (isLow(pick) ? pick : firstLowGrade(prices ?? null)) : t);

  const ready = card && card !== 'error' ? card : null;
  const slab = useMemo<Card | null>(() => (ready ? slabFor(ready, pick) : null), [ready, pick]);

  // A browsing page, not your own slab: a touch smaller on narrow phones so the numbers fit.
  const slabW = Math.min(size.heroW, Math.round(width * 0.46));
  const heroH = Math.round((slabW * size.heroH) / size.heroW) + space.xl;

  const back = (
    <View style={[styles.nav, { top: insets.top }]}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon />
      </IconButton>
    </View>
  );

  if (!ready || !slab) {
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top + size.touch }}>
        {back}
        {card === undefined ? null : (
          <View style={styles.gutter}>
            <Text style={[type.text, { color: color.secondary }]}>
              {card === 'error' ? 'Can’t load this card right now.' : 'This card isn’t in the catalog anymore.'}
            </Text>
            {card === 'error' ? <TryAgain onPress={() => setAttempt((n) => n + 1)} /> : null}
          </View>
        )}
      </View>
    );
  }

  const price: CardPrice | null | undefined = prices === undefined ? undefined : pick === 'raw' ? prices?.raw : prices?.grades[pick];
  const quiet = pick !== 'raw' && !!prices && isQuiet(price, prices.fetchedAt);
  const series = price?.series90 ?? [];
  const charted = series.length > 1;
  const change = price && charted ? changeOver(price, 89) : null;
  const no = cardNumber(ready.number);
  const subtitle = [setTitle(ready.setName), no && `#${no}`, ready.language === 'ja' ? 'JP' : null].filter(Boolean).join(' · ');
  const otherGame = ready.game !== 'pokemon' ? ready.game : null;
  const buy = buying && price && !quiet ? buyPrices(price.marketCents, rules) : null;
  const catalogOnly = pick === 'raw' && price != null && series.length === 1;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 swipe-back starts anywhere; without this, dragging along the chart pops the page. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.s, paddingBottom: space.xl }}>
        <View style={[styles.hero, { height: heroH }]}>
          <SlabView card={slab} width={slabW} />
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[type.title, { color: color.ink }]}>
              {displayName(ready.name)}
            </Text>
            <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
              {subtitle}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[type.title, { color: quiet ? color.secondary : color.ink }]}
              accessibilityLabel={
                price
                  ? `${gradeLabel(pick)} ${money(price.marketCents)}${change != null ? `, ${pct(change)} over 90 days` : ''}`
                  : undefined
              }
            >
              {price ? money(price.marketCents) : '—'}
            </Text>
            {change != null && !quiet ? (
              <Text style={[type.text, { color: color.secondary }]}>
                <Text style={{ color: change >= 0 ? color.gain : color.loss }}>{pct(change)}</Text> 90d
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.gutter, { paddingTop: space.xl }]}>
          <Segmented<Tab>
            value={isLow(pick) ? 'low' : (pick as Tab)}
            onChange={onTab}
            options={[
              { value: 'raw', label: 'Raw' },
              { value: 'psa10', label: 'PSA 10' },
              { value: 'psa9', label: '9' },
              { value: 'psa8', label: '8' },
              { value: 'low', label: '7–1' },
            ]}
          />
          {isLow(pick) ? <LowGrades pick={pick} prices={prices ?? null} onPick={choose} /> : null}

          {buy ? (
            <View style={styles.buyRow}>
              <Text style={[type.body, styles.label]}>
                Open <Text style={{ fontWeight: '600' }}>{money(buy.target)}</Text>
              </Text>
              <Text style={[type.body, styles.label]}>
                pay up to <Text style={{ color: color.loss, fontWeight: '600' }}>{money(buy.max)}</Text>
              </Text>
            </View>
          ) : null}

          <View style={styles.chart}>
            {prices === undefined ? (
              <Text style={[type.text, { color: color.secondary }]}>Loading prices…</Text>
            ) : charted && !quiet ? (
              <PriceChart values={series} paidCents={null} width={width - space.gutter * 2} height={140} tint={trendTint(series)} asOf={price?.asOf} />
            ) : (
              <>
                <Text style={[type.text, { color: color.secondary }]}>{emptyLine(pick, prices, otherGame, quiet ? price : null)}</Text>
                {prices === null ? <TryAgain onPress={() => setAttempt((n) => n + 1)} /> : null}
              </>
            )}
          </View>

          {price && !quiet ? (
            <>
              <Hairline />
              <View style={styles.row}>
                <Text style={[type.body, styles.label]}>
                  {pick === 'raw' ? (catalogOnly ? 'TCGplayer low–market' : 'TCGplayer market, 30 days') : `${price.sales30d} eBay ${price.sales30d === 1 ? 'sale' : 'sales'}, 30 days`}
                </Text>
                <Text
                  style={[type.body, { color: color.ink }]}
                  accessibilityLabel={price.lowCents === price.highCents ? undefined : `from ${money(price.lowCents)} to ${money(price.highCents)}`}
                >
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
      {back}
      <View style={[styles.gutter, { paddingBottom: Math.max(insets.bottom, space.l), paddingTop: space.m }]}>
        <PrimaryButton title="Add to vault" onPress={() => router.push({ pathname: '/add', params: addParams(ready, pick) })} />
      </View>
    </View>
  );
}

/** PSA 7 to 1 as a quiet row of numbers under the toggle. Grades without recent sales go gray. */
function LowGrades({ pick, prices, onPick }: { pick: Choice; prices: SearchPrices | null; onPick: (g: SearchGrade) => void }) {
  return (
    <View style={styles.lowRow} accessibilityRole="tablist">
      {LOW_GRADES.map((g) => {
        const on = g === pick;
        const p = prices?.grades[g];
        const sold = !!p && !!prices && !isQuiet(p, prices.fetchedAt);
        return (
          <Pressable
            key={g}
            accessibilityRole="tab"
            accessibilityLabel={`${gradeLabel(g)}${sold ? '' : ', no recent sales'}`}
            accessibilityState={{ selected: on }}
            onPress={() => onPick(g)}
            style={styles.lowCell}
          >
            <Text style={[type.body, { color: on || sold ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>{g.slice(3)}</Text>
            <View style={[styles.lowMark, on && { backgroundColor: color.ink }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function TryAgain({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12} style={{ paddingTop: space.m }}>
      <Text style={[type.text, { color: color.ink, fontWeight: '600' }]}>Try again</Text>
    </Pressable>
  );
}

function emptyLine(pick: Choice, prices: SearchPrices | null, otherGame: string | null, quiet: CardPrice | null | undefined): string {
  if (!prices) return 'Prices aren’t reachable right now.';
  if (pick === 'raw') return prices.raw ? 'Price history starts once more days come in.' : 'No TCGplayer price for this card.';
  if (otherGame) return `Graded prices for ${GAME_NAME[otherGame] ?? otherGame} aren’t available yet.`;
  if (prices.capped && prices.source === 'catalog') return 'Graded prices load again tomorrow.';
  if (prices.source === 'catalog') return 'Graded prices aren’t reachable right now.';
  // The price shown in the header for a quiet grade is the last 30-day median before it went quiet.
  if (quiet) return `No ${gradeLabel(pick)} sales in 30 days. Last price ${money(quiet.marketCents)}, as of ${fmtDay(quiet.asOf)}.`;
  return `No ${gradeLabel(pick)} sales in the last 90 days.`;
}

/** "SWSH07: Evolving Skies" → "Evolving Skies"; the code adds nothing next to the set name. */
function setTitle(name: string): string {
  return name.replace(/^[A-Z0-9.-]{2,8}:\s+/, '');
}

/** A stand-in card for the slab render: the searched card at the picked grade, no cert. */
function slabFor(c: CatalogCard, pick: Choice): Card {
  return {
    id: `search-${c.productId}`,
    certNumber: null,
    grader: pick === 'raw' ? 'raw' : 'psa',
    grade: pick === 'raw' ? null : Number(pick.slice(3)),
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
  // Floats over the hero so the slab doesn't sit under an empty 44 pt bar.
  nav: { position: 'absolute', left: space.gutter - 10, zIndex: 1 },
  hero: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, paddingHorizontal: space.gutter },
  chart: { minHeight: 172, justifyContent: 'center', paddingTop: space.xl, paddingBottom: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.l },
  buyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.l },
  label: { color: color.ink, fontWeight: '400' },
  lowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.s },
  lowCell: { minWidth: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  lowMark: { width: 16, height: 2, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
});
