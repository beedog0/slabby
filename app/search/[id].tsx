// A card opened from search: what it's worth raw and as a PSA 10 to 1, one chart, and one button
// to add it to the vault. 10/9/8 sit on the toggle; 7 to 1 sit behind "7–1" because most cards
// sell those grades rarely. All grades come from the same price call (card-prices, cached a day),
// so picking a lower grade costs nothing. Drag the slab (or sleeved single) to tilt it; tap a slab
// to spin it 360°, as on a vault card. In con mode (?con=1) it also shows what to pay.
//
// Sell mode (?sell=1, from the scan sheet's Sell): the same page for the card you just scanned, at
// its grade, with your asking price, where it sits against market and a rating against what you
// paid at the top (SellSummary), and "Put up for sale" as the one button. The scan's draft lives
// in src/store/sellDraft.ts.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trendTint } from '../../src/components/MiniChart';
import { PriceChart } from '../../src/components/PriceChart';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { cardPrice, money, pct, promoTag, thinNote } from '../../src/lib/format';
import { CardName } from '../../src/components/CardName';
import { chartRanges, history, rangeLabel, rangeSeries, realPoints, type Range } from '../../src/pricing/cardStats';
import { FindPriceRow } from '../../src/components/estimate/FindPriceRow';
import { cardForSearch } from '../../src/services/estimate';
import { CardAnalyticsView, openSetPage, setTitle } from '../../src/components/search/CardAnalytics';
import type { CardPrice } from '../../src/services/comps';
import type { Found } from '../../src/services/searchFilters';
import { KeyboardDone } from '../../src/components/KeyboardDone';
import { SellSummary } from '../../src/components/sell/SellSummary';
import { packFor, setCards } from '../../src/services/setCards';
import { saveDraft, useSellDraft } from '../../src/store/sellDraft';
import {
  addParams,
  buyPrices,
  cardNumber,
  catalogCard,
  displayName,
  nameAndVariant,
  firstLowGrade,
  gradeLabel,
  isQuiet,
  LOW_GRADES,
  openPrices,
  SEARCH_GRADES,
  type CatalogCard,
  type SearchGrade,
  type SearchPrices,
} from '../../src/services/search';
import { useRules } from '../../src/store/rules';
import { useTrade } from '../../src/store/trade';
import { useWishlist, wishKey, type WishGrade } from '../../src/store/wishlist';
import { size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';
import type { Card } from '../../src/types';
import { sealedLabel } from '../../src/lib/sealed';

type Choice = 'raw' | SearchGrade;
type Tab = 'raw' | 'psa10' | 'psa9' | 'psa8' | 'low';
const GAME_NAME: Record<string, string> = { onepiece: 'One Piece', riftbound: 'Riftbound', pokemon: 'Pokémon' };
const isLow = (c: Choice) => (LOW_GRADES as readonly string[]).includes(c);
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function SearchedCard() {
  const color = useColors();
  const styles = useStyles();
  const { id, con, sell, grade, trade } = useLocalSearchParams<{ id: string; con?: string; sell?: string; grade?: string; trade?: string }>();
  const buying = con === '1';
  // From the trade calculator: the one action is putting this card, at the grade shown, on their side.
  const trading = trade === '1';
  const addTheirs = useTrade((s) => s.addTheirs);
  const draft = useSellDraft((s) => (sell === '1' ? s.draft : null));
  const patchDraft = useSellDraft((s) => s.patch);
  const selling = !!draft;
  const [pack, setPack] = useState<{ name: string; cents: number } | null | undefined>(undefined);
  const rules = useRules((s) => s.rules);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [card, setCard] = useState<CatalogCard | null | undefined | 'error'>(undefined);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  // Opens on the raw single (Bryan, 2026-11-06); every grade is one tap away on the toggle.
  // Selling opens on the scanned card's own grade; a card's analytics elsewhere (vault, con mode)
  // open this page at the grade tapped; otherwise Raw.
  const [pick, setPick] = useState<Choice>(() =>
    draft ? draftGrade(draft.card) : (SEARCH_GRADES as readonly string[]).includes(grade ?? '') ? (grade as SearchGrade) : 'raw',
  );
  const [tilting, setTilting] = useState(false);
  const wanted = useWishlist((s) => s.items.find((i) => i.key === wishKey(Number(id), pick as WishGrade)));
  const [attempt, setAttempt] = useState(0);
  // Chart window; falls to the next one with a chart when this one has none.
  const [range, setRange] = useState<Range>(90);
  const [more, setMore] = useState<Found[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);

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

  useEffect(() => {
    let live = true;
    setMore([]);
    if (ready)
      setCards(ready)
        .then((m) => {
          if (!live) return;
          setGroupId(m.groupId);
          setMore(m.cards);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [ready, buying]);
  // A pull is rated against one pack of its set, when the catalog has that price.
  const pulled = draft?.cost?.kind === 'pulled';
  useEffect(() => {
    let live = true;
    if (pulled && groupId != null)
      packFor(groupId)
        .then((p) => live && setPack(p))
        .catch(() => live && setPack(null));
    return () => {
      live = false;
    };
  }, [pulled, groupId]);
  // Selling shows your own slab (cert and label) rather than a stand-in.
  const slab = useMemo<Card | null>(() => (draft ? draft.card : ready ? slabFor(ready, pick) : null), [draft, ready, pick]);

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

  const price: CardPrice | null | undefined =
    prices === undefined ? undefined : pick === 'raw' ? prices?.raw : prices?.grades[pick];
  const quiet = pick !== 'raw' && !!prices && isQuiet(price, prices.fetchedAt);
  // Only real prices make a chart; a single price carried forward is a flat line, not history.
  // A grade with no sale in 30 days still charts its older sales (up to 6 months).
  const today = prices?.fetchedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const ranges = chartRanges(price, today);
  const shown = ranges.includes(range) ? range : (ranges.find((r) => r > range) ?? ranges[ranges.length - 1]);
  const ranged = shown ? rangeSeries(price, shown, today) : null;
  const sold = pick !== 'raw' ? lastSoldLine(price, quiet ? pick : null) : null;
  const hist = history(price);
  const change = hist && !quiet ? hist.change : null;
  // A graded price from a handful of sales is a guess; say so under the number.
  const thin = !ready.sealedType && pick !== 'raw' && price && !quiet ? thinNote(price.sales30d) : null;
  const no = cardNumber(ready.number);
  // Sealed product: one TCGplayer market price with its nightly chart; no grades, no slab.
  const sealed = ready.sealedType ?? null;
  // The language is the badge beside the name.
  const detail = (sealed ? [sealedLabel(sealed)] : [no && `#${no}`, promoTag(ready, { setShown: true })]).filter(Boolean).join(' · ');
  const openSet = () => openSetPage(ready, groupId, { trade: trading });
  const otherGame = ready.game !== 'pokemon' ? ready.game : null;
  const buy = buying && price && !quiet ? buyPrices(price.marketCents, rules) : null;
  // The sheet's market wins: for a raw card it's the print you picked.
  const sellMarket = draft ? (draft.marketCents ?? (price && !quiet ? price.marketCents : null)) : null;
  const sellCost = draft?.cost?.kind === 'pulled' ? { kind: 'pulled' as const, packCents: pack?.cents ?? null } : (draft?.cost ?? null);
  const putUp = () => {
    if (!draft) return;
    const saved = saveDraft(draft, { cost: sellCost, marketCents: sellMarket, rules });
    router.dismissAll();
    router.push(`/card/${saved.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      {/* iOS 26 swipes back from anywhere; keep rightward drags on the price chart. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView scrollEnabled={!tilting} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: insets.top + space.s, paddingBottom: space.xl }}>
        <View style={[styles.hero, { height: heroH }]}>
          <SlabView card={slab} width={slabW} interactive spotlight onDragChange={setTilting} />
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Name on its own line, the variant ("Alternate Art Secret") on the next: nothing truncates. A sealed product shows its full name. */}
            <CardName name={sealed ? ready.name : nameAndVariant(ready.name).name} language={ready.language} numberOfLines={4} large style={[type.title, { color: color.ink }]} />
            {!sealed && nameAndVariant(ready.name).variant ? (
              <Text style={[type.text, { color: color.secondary }]}>{nameAndVariant(ready.name).variant}</Text>
            ) : null}
            <Text style={[type.text, { color: color.secondary }]}>
              {/* The set name opens the whole set. */}
              <Text onPress={openSet} accessibilityRole="link" style={{ color: color.ink }}>
                {setTitle(ready.setName)}
              </Text>
              {detail ? ` · ${detail}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[type.title, { color: quiet ? color.secondary : color.ink }]}
              accessibilityLabel={
                price
                  ? `${sealed ? 'Market' : gradeLabel(pick)} ${cardPrice(price.marketCents)}${change != null ? `, ${pct(change)} over ${hist!.days} days` : ''}`
                  : undefined
              }
            >
              {price ? cardPrice(price.marketCents) : '—'}
            </Text>
            {thin ? <Text style={[type.text, { color: color.secondary }]}>{thin}</Text> : null}
            {change != null ? (
              <Text style={[type.text, { color: color.secondary }]}>
                <Text style={{ color: change >= 0 ? color.gain : color.loss }}>{pct(change)}</Text> {hist!.days}d
              </Text>
            ) : null}
          </View>
        </View>

        {draft ? (
          <View style={[styles.gutter, { paddingTop: space.xl }]}>
            <SellSummary
              askCents={draft.askCents}
              onAsk={(askCents) => patchDraft({ askCents })}
              marketCents={sellMarket}
              lowCents={price && !quiet ? price.lowCents : null}
              gradeName={gradeLabel(pick)}
              cost={sellCost}
              packName={pack?.name}
              rules={rules}
            />
            <View style={{ paddingTop: space.xl }}>
              <Hairline />
            </View>
            <Text style={[type.section, { color: color.ink, paddingTop: space.xl }]}>{gradeLabel(pick)} prices</Text>
          </View>
        ) : null}

        <View style={[styles.gutter, { paddingTop: selling ? 0 : space.xl }]}>
          {selling || sealed ? null : (
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
          )}
          {isLow(pick) && !selling ? <LowGrades pick={pick} prices={prices ?? null} onPick={choose} /> : null}

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
            ) : ranged ? (
              <>
                <PriceChart
                  values={ranged.values}
                  paidCents={null}
                  width={width - space.gutter * 2}
                  height={140}
                  tint={trendTint(ranged.values, color)}
                  asOf={ranged.asOf}
                />
                {ranges.length > 1 ? (
                  <View style={styles.ranges}>
                    {ranges.map((r) => {
                      const on = r === shown;
                      return (
                        <Pressable
                          key={r}
                          onPress={() => setRange(r)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={r === 180 ? 'Six months' : `${r} days`}
                        >
                          <Text style={[type.text, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>{rangeLabel(r)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {sold ? <Text style={[type.secondary, { color: color.secondary, paddingTop: space.s }]}>{sold}</Text> : null}
              </>
            ) : (
              <>
                <Text style={[type.text, { color: color.secondary }]}>
                  {price && !quiet ? thinLine(price) : sealed ? sealedEmpty(prices) : emptyLine(pick, prices, otherGame, quiet ? price : null)}
                </Text>
                {prices === null ? <TryAgain onPress={() => setAttempt((n) => n + 1)} /> : null}
                {canEstimate(pick, prices, price, ready.game) ? <FindPriceRow card={cardForSearch(ready, pick)} /> : null}
              </>
            )}
          </View>

          <CardAnalyticsView pick={pick} prices={prices} setName={ready.setName} more={more} onPick={selling ? () => {} : choose} onAll={openSet} con={buying} trade={trading} sealed={!!sealed} ebay={ready} />
          {prices?.capped ? (
            <Text style={[type.secondary, { color: color.secondary, paddingTop: space.m }]}>
              Graded prices for new cards are paused until tomorrow to save credits for your scans.
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {back}
      <View style={[styles.gutter, { paddingBottom: Math.max(insets.bottom, space.l), paddingTop: space.m }]}>
        {draft ? (
          <PrimaryButton title={`Put up for sale at ${money(draft.askCents)}`} onPress={putUp} />
        ) : trading ? (
          price && !quiet ? (
            <PrimaryButton
              title={`Add to their side · ${money(price.marketCents)}`}
              onPress={() => {
                addTheirs({
                  key: `${ready.productId}:${pick}`,
                  productId: ready.productId,
                  grade: pick,
                  name: displayName(ready.name),
                  setName: ready.setName,
                  number: ready.number,
                  imageUrl: ready.imageUrl,
                  game: ready.game,
                  language: ready.language,
                  marketCents: price.marketCents,
                });
                router.dismissTo('/con/trade');
              }}
            />
          ) : (
            <Text style={[type.text, { color: color.secondary, textAlign: 'center', minHeight: size.button, paddingTop: space.l }]}>
              {price === undefined ? 'Loading prices' : 'No recent price at this grade. Pick another grade.'}
            </Text>
          )
        ) : buying ? (
          // Buying at a con: the next step is the seller's price, rated against your rules.
          // Or save the card to the wishlist with the price you're hunting for.
          <>
            <PrimaryButton
              title="They're asking…"
              onPress={() => router.push({ pathname: '/con/buy/[id]', params: { id: String(ready.productId), grade: pick } })}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/con/want/[id]', params: { id: String(ready.productId), grade: pick } })}
              style={{ minHeight: size.touch, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={[type.body, { color: color.ink }]}>
                {wanted ? `On your wishlist at ${money(wanted.targetCents)}` : 'Add to wishlist'}
              </Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton title="Add to vault" onPress={() => router.push({ pathname: '/add', params: addParams(ready, pick) })} />
        )}
      </View>
      {selling ? <KeyboardDone /> : null}
    </View>
  );
}

/** PSA 7 to 1 as a quiet row of numbers under the toggle. Grades without recent sales go gray. */
function LowGrades({ pick, prices, onPick }: { pick: Choice; prices: SearchPrices | null; onPick: (g: SearchGrade) => void }) {
  const color = useColors();
  const styles = useStyles();
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
            <Text style={[type.body, { color: on || sold ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>
              {g.slice(3)}
            </Text>
            <View style={[styles.lowMark, on && { backgroundColor: color.ink }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function TryAgain({ onPress }: { onPress: () => void }) {
  const color = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12} style={{ paddingTop: space.m }}>
      <Text style={[type.text, { color: color.ink, fontWeight: '600' }]}>Try again</Text>
    </Pressable>
  );
}

/**
 * "Last sold Nov 6 · $412" (", 2 sold that day" when more than one), from the latest day with a
 * sale. For a grade with none in 30 days (`quiet` is its grade) it leads with that.
 */
export function lastSoldLine(p: CardPrice | null | undefined, quiet: Choice | null): string | null {
  const s = p?.lastSale;
  if (!s) return null;
  const line = `Last sold ${fmtDay(s.day)} · ${money(s.cents)}${s.count > 1 ? ` avg of ${s.count}` : ''}`;
  return quiet && quiet !== 'raw' ? `No ${gradeLabel(quiet)} sales in 30 days. ${line}` : line;
}

/** A price we have but can't chart: say how much there is, not draw a flat line. */
function thinLine(p: CardPrice & { points?: number; since?: string }): string {
  const n = realPoints(p);
  const since = p.since ? ` since ${fmtDay(p.since)}` : '';
  return `${n <= 1 ? 'One price' : `Only ${n} prices`}${since}. The chart starts once there are a few more.`;
}

/**
 * A grade with no real price can search sold listings for an estimate. Not when the price
 * service is only paused or unreachable for a Pokémon grade (the real price comes back), and not
 * for a quiet grade, which still has its last price.
 */
function canEstimate(pick: Choice, prices: SearchPrices | null | undefined, price: CardPrice | null | undefined, game: string): boolean {
  if (!prices || price) return false;
  if (pick !== 'raw' && game === 'pokemon' && prices.source === 'catalog') return false;
  return true;
}

function emptyLine(pick: Choice, prices: SearchPrices | null, otherGame: string | null, quiet: CardPrice | null | undefined): string {
  if (!prices) return 'Prices aren’t reachable right now.';
  if (pick === 'raw') return prices.raw ? 'Price history starts once more days come in.' : 'No TCGplayer price for this card.';
  if (otherGame) return `Graded prices for ${GAME_NAME[otherGame] ?? otherGame} aren’t available yet.`;
  if (prices.capped && prices.source === 'catalog') return 'Graded prices load again tomorrow.';
  if (prices.source === 'catalog') return 'Graded prices aren’t reachable right now.';
  // The price shown in the header for a quiet grade is the last 30-day median before it went quiet.
  if (quiet) return lastSoldLine(quiet, pick) ?? `No ${gradeLabel(pick)} sales in 30 days. Last price ${money(quiet.marketCents)}, as of ${fmtDay(quiet.asOf)}.`;
  return `No ${gradeLabel(pick)} sales in the last 90 days.`;
}

function sealedEmpty(prices: SearchPrices | null): string {
  if (!prices) return 'Prices aren’t reachable right now.';
  return prices.raw ? 'Price history builds night by night. The chart starts after a few nights.' : 'No TCGplayer price for this yet.';
}

/** The search page's grade for a vault card: its PSA grade, else raw. */
function draftGrade(c: Card): Choice {
  if (c.grader === 'psa' && c.grade != null && c.grade >= 1 && c.grade <= 10) return `psa${Math.floor(c.grade)}` as SearchGrade;
  return 'raw';
}

/** A stand-in card for the slab render: the searched card at the picked grade, no cert. */
function slabFor(c: CatalogCard, pick: Choice): Card {
  if (c.sealedType)
    return {
      id: `search-${c.productId}`,
      certNumber: null,
      grader: 'raw',
      grade: null,
      name: c.name,
      setName: c.setName,
      setCode: c.setCode,
      number: null,
      language: c.language,
      year: null,
      imageFrontUrl: c.imageUrl,
      sealed: c.sealedType,
      productId: c.productId,
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

const useStyles = themed((color) => StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  // Floats over the hero so the slab doesn't sit under an empty 44 pt bar.
  nav: { position: 'absolute', left: space.gutter - 10, zIndex: 1 },
  hero: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, paddingHorizontal: space.gutter },
  ranges: { flexDirection: 'row', gap: space.xl, paddingTop: space.m },
  chart: { minHeight: 172, justifyContent: 'center', paddingTop: space.xl, paddingBottom: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.l },
  buyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.l },
  label: { color: color.ink, fontWeight: '400' },
  lowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.s },
  lowCell: { minWidth: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  lowMark: { width: 16, height: 2, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
}));
