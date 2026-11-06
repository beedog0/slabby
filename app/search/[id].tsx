// A card opened from search: what it's worth raw and as a PSA 10 to 1, one chart, and one button
// to add it to the vault. 10/9/8 sit on the toggle; 7 to 1 sit behind "7–1" because most cards
// sell those grades rarely. All grades come from the same price call (card-prices, cached a day),
// so picking a lower grade costs nothing. Drag the slab (or sleeved single) to tilt it; tap a slab
// to spin it 360°, as on a vault card. In con mode (?con=1) it also shows what to pay.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trendTint } from '../../src/components/MiniChart';
import { PriceChart } from '../../src/components/PriceChart';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { money, pct } from '../../src/lib/format';
import { chartable, gradingLine, gradingRead, history, liquidity, ratio, realPoints, spread, spreadWord, trend } from '../../src/pricing/cardStats';
import type { CardPrice } from '../../src/services/comps';
import {
  addParams,
  buyPrices,
  cardNumber,
  catalogCard,
  displayName,
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
  // Opens on the raw single (Bryan, 2026-11-06); every grade is one tap away on the toggle.
  const [pick, setPick] = useState<Choice>('raw');
  const [tilting, setTilting] = useState(false);
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

  const choose = useCallback((c: Choice) => setPick(c), []);
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
  // Only real prices make a chart; a single price carried forward is a flat line, not history.
  const charted = chartable(price);
  const hist = history(price);
  const change = hist && !quiet ? hist.change : null;
  const no = cardNumber(ready.number);
  const subtitle = [setTitle(ready.setName), no && `#${no}`, ready.language === 'ja' ? 'JP' : null].filter(Boolean).join(' · ');
  const otherGame = ready.game !== 'pokemon' ? ready.game : null;
  const buy = buying && price && !quiet ? buyPrices(price.marketCents, rules) : null;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 swipe-back starts anywhere; without this, dragging along the chart pops the page. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView scrollEnabled={!tilting} contentContainerStyle={{ paddingTop: insets.top + space.s, paddingBottom: space.xl }}>
        <View style={[styles.hero, { height: heroH }]}>
          <SlabView card={slab} width={slabW} interactive onDragChange={setTilting} />
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
                  ? `${gradeLabel(pick)} ${money(price.marketCents)}${change != null ? `, ${pct(change)} over ${hist!.days} days` : ''}`
                  : undefined
              }
            >
              {price ? money(price.marketCents) : '—'}
            </Text>
            {change != null ? (
              <Text style={[type.text, { color: color.secondary }]}>
                <Text style={{ color: change >= 0 ? color.gain : color.loss }}>{pct(change)}</Text> {hist!.days}d
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
                <Text style={[type.text, { color: color.secondary }]}>
                  {price && !quiet ? thinLine(price) : emptyLine(pick, prices, otherGame, quiet ? price : null)}
                </Text>
                {prices === null ? <TryAgain onPress={() => setAttempt((n) => n + 1)} /> : null}
              </>
            )}
          </View>

          {price && !quiet && prices ? (
            buying ? (
              <CompsRow pick={pick} price={price} />
            ) : (
              <KeyStats pick={pick} price={price} prices={prices} />
            )
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

/** Con mode keeps one row of comps under the buying numbers. */
function CompsRow({ pick, price }: { pick: Choice; price: CardPrice }) {
  return (
    <>
      <Hairline />
      <View style={styles.row}>
        <Text style={[type.body, styles.label]}>
          {pick === 'raw' ? 'TCGplayer market' : `${price.sales30d} eBay ${price.sales30d === 1 ? 'sale' : 'sales'}, 30 days`}
        </Text>
        <Text style={[type.body, { color: color.ink }]}>{rangeText(price)}</Text>
      </View>
      <Hairline />
    </>
  );
}

const rangeText = (p: CardPrice) =>
  p.lowCents === p.highCents ? money(p.marketCents) : `${money(p.lowCents)}–${money(p.highCents).replace('$', '')}`;
const times = (r: number | null) => (r == null ? null : `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`);

/**
 * Key stats for the picked grade, stock-app style: a one-line read, then label-over-number cells
 * two to a row. A stat with too little behind it is left out, never shown as a dash. Math lives
 * in src/pricing/cardStats.ts.
 */
function KeyStats({ pick, price, prices }: { pick: Choice; price: CardPrice; prices: SearchPrices }) {
  const hist = history(price);
  const cells: { label: string; value: string | null }[] = [];
  const read: ReactNode[] = [];
  let grading: string | null = null;

  if (pick === 'raw') {
    const p10 = prices.grades.psa10;
    const p9 = prices.grades.psa9;
    cells.push(
      { label: 'TCGplayer market', value: money(price.marketCents) },
      { label: 'TCGplayer low', value: price.lowCents < price.marketCents ? money(price.lowCents) : null },
      { label: '90-day high', value: hist && money(hist.high) },
      { label: '90-day low', value: hist && money(hist.low) },
      { label: 'PSA 10 vs raw', value: times(ratio(p10, price, true, false)) },
      { label: 'PSA 9 vs raw', value: times(ratio(p9, price, true, false)) },
    );
    const g = gradingRead(price, p10, p9);
    grading = g && gradingLine(g);
  } else {
    const n = Number(pick.slice(3));
    const below = n > 1 ? prices.grades[`psa${n - 1}` as SearchGrade] : null;
    const sp = spread(price);
    cells.push(
      { label: 'Sales, 30 days', value: String(price.sales30d) },
      { label: '30-day range', value: price.sales30d >= 2 && price.lowCents !== price.highCents ? rangeText(price) : null },
      { label: '90-day high', value: hist && money(hist.high) },
      { label: '90-day low', value: hist && money(hist.low) },
      { label: 'vs raw', value: times(ratio(price, prices.raw, true, false)) },
      { label: `vs PSA ${n - 1}`, value: n > 1 ? times(ratio(price, below)) : null },
    );
    read.push(liquidity(price.sales30d));
    const word = sp != null ? spreadWord(sp) : null;
    if (word) read.push(word);
  }
  if (hist) {
    const t = trend(hist.change);
    read.splice(
      pick === 'raw' ? 0 : 1,
      0,
      t === 'Flat' ? (
        `Flat over ${hist.days} days`
      ) : (
        <Text key="t">
          {t} <Text style={{ color: t === 'Rising' ? color.gain : color.loss }}>{pct(hist.change)}</Text> over {hist.days} days
        </Text>
      ),
    );
  } else if (pick === 'raw') read.push('Not enough price history for a trend yet');

  const shown = cells.filter((c): c is { label: string; value: string } => !!c.value);
  const rows: (typeof shown)[] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

  return (
    <View style={{ paddingTop: space.xl }}>
      <Text style={[type.section, { color: color.ink }]}>Key stats</Text>
      {read.length ? (
        <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
          {read.map((r, i) => (
            <Text key={i}>
              {i ? ' · ' : ''}
              {r}
            </Text>
          ))}
        </Text>
      ) : null}
      <View style={{ paddingTop: space.m }}>
        {rows.map((row, i) => (
          <View key={i}>
            <Hairline />
            <View style={styles.statRow}>
              {row.map((c) => (
                <View key={c.label} style={styles.stat} accessible accessibilityLabel={`${c.label}, ${c.value}`}>
                  <Text style={[type.secondary, { color: color.secondary }]}>{c.label}</Text>
                  <Text style={[type.numberM, { color: color.ink }]}>{c.value}</Text>
                </View>
              ))}
              {row.length === 1 ? <View style={styles.stat} /> : null}
            </View>
          </View>
        ))}
        <Hairline />
      </View>
      {grading ? <Text style={[type.text, { color: color.ink, paddingTop: space.l }]}>{grading}</Text> : null}
      <Text style={[type.caption, { color: color.secondary, paddingTop: grading ? space.xs : space.m }]}>
        {pick === 'raw'
          ? grading
            ? 'TCGplayer market. Grading math assumes $25 to grade, $8 shipping, eBay fees, and a PSA 9 when it misses.'
            : 'TCGplayer market price, near mint.'
          : 'eBay sold, 30-day median. Ratios need 5 sales on each side.'}
      </Text>
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

/** A price we have but can't chart: say how much there is, not draw a flat line. */
function thinLine(p: CardPrice & { points?: number; since?: string }): string {
  const n = realPoints(p);
  const since = p.since ? ` since ${fmtDay(p.since)}` : '';
  return `${n <= 1 ? 'One price' : `Only ${n} prices`}${since}. The chart starts once there are a few more.`;
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
  statRow: { flexDirection: 'row', gap: space.xl, paddingVertical: space.m },
  stat: { flex: 1, gap: 2 },
  lowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.s },
  lowCell: { minWidth: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  lowMark: { width: 16, height: 2, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
});
