// The search card page's analytics, for any card in the app: Key stats (a one-line read and
// label-over-number cells), the 90-day range, Prices by grade, and More from the set. The search
// page passes what it already loaded (CardAnalyticsView); a vault card, con mode's Before the
// table and anywhere else a Card is shown use <CardAnalytics card={…} />, which finds the card's
// catalog product and loads the same prices (card-prices, cached a day) at the card's own grade.
// Color rule (DESIGN.md): ink and gray marks, green/red only on change numbers.

import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { money, pct } from '../../lib/format';
import { gradingLine, gradingRead, history, liquidity, ratio, spread, spreadWord, trend } from '../../pricing/cardStats';
import { catalogFor, choiceFor, type Choice } from '../../services/cardLink';
import { priceFor, type CardPrice } from '../../services/comps';
import { usePrices } from '../../store/prices';
import { isQuiet, openPrices, type CatalogCard, type SearchGrade, type SearchPrices } from '../../services/search';
import type { Found } from '../../services/searchFilters';
import { setCards } from '../../services/setCards';
import { color, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { Hairline } from '../ui';
import { buySignal, shortDay, signalGap, thinRead } from '../../pricing/buySignal';
import { BuySignalDial } from './BuySignal';
import { GradeLadder, RangeMeter, SetRow } from './CardInsights';

export type { Choice };

/** "SWSH07: Evolving Skies" → "Evolving Skies"; the code adds nothing next to the set name. */
export function setTitle(name: string): string {
  return name.replace(/^[A-Z0-9.-]{2,8}:\s+/, '');
}

export const rangeText = (p: CardPrice) =>
  p.lowCents === p.highCents ? money(p.marketCents) : `${money(p.lowCents)}–${money(p.highCents).replace('$', '')}`;
const times = (r: number | null) => (r == null ? null : `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`);

/** Open the set page for a catalog card. */
export function openSetPage(card: CatalogCard, groupId: number | null) {
  if (groupId == null) return;
  router.push({ pathname: '/set/[id]', params: { id: String(groupId), name: card.setName, language: card.language, game: card.game } });
}

/**
 * Everything under the chart, for one grade. Key stats and the range need a live price for that
 * grade; Prices by grade and More from the set show whenever there's something to show.
 */
export function CardAnalyticsView({
  pick,
  prices,
  setName,
  more,
  onPick,
  onAll,
  con,
  own,
}: {
  pick: Choice;
  prices: SearchPrices | null | undefined;
  setName: string;
  more: Found[];
  onPick: (c: Choice) => void;
  onAll?: () => void;
  con?: boolean;
  /** The picked grade's price is the card's own (vault) price: quiet means no sale in 30 days. */
  own?: boolean;
}) {
  const price = !prices ? null : pick === 'raw' ? prices.raw : prices.grades[pick];
  const live = !!price && !!prices && (pick === 'raw' || (own ? price.sales30d > 0 : !isQuiet(price, prices.fetchedAt)));
  const hist = live ? history(price) : null;
  const graded = pick !== 'raw';
  const sig = hist ? buySignal(price, graded) : null;
  // A grade with a price but no recent sale still shows what we know, with its caveat.
  const quiet = !!price && !!prices && !live;
  return (
    <>
      {live && price && prices ? <KeyStats pick={pick} price={price} prices={prices} /> : null}
      {quiet && price ? <ThinStats price={price} /> : null}
      {hist && price ? <RangeMeter low={hist.low} high={hist.high} now={price.marketCents} days={hist.days} /> : null}
      {price ? <BuySignalDial signal={sig} gap={sig ? undefined : signalGap(price, graded, quiet)} graded={graded} /> : null}
      {prices ? <GradeLadder prices={prices} pick={pick} onPick={onPick} /> : null}
      <SetRow setName={setTitle(setName)} cards={more} onAll={onAll} con={con} />
    </>
  );
}

/**
 * Analytics under a card you hold (or any Card): same sections as search, at the card's grade.
 * Tapping another grade opens that card's search page at that grade. Renders nothing until the
 * card is matched, and nothing at all when it can't be.
 */
export function CardAnalytics({ card, con }: { card: Card; con?: boolean }) {
  const pick = choiceFor(card);
  const [cat, setCat] = useState<CatalogCard | null>(null);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  const [more, setMore] = useState<Found[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const identity = [card.game, card.setCode, card.number, card.language, card.name].join('|');
  // Re-render when the vault's prices change (pull to refresh, nightly load).
  usePrices((s) => s.byKey);

  useEffect(() => {
    let live = true;
    setCat(null);
    setPrices(undefined);
    setMore([]);
    catalogFor(card)
      .then((c) => {
        if (!live || !c) return;
        setCat(c);
        openPrices(c.productId)
          .then((p) => live && setPrices(p))
          .catch(() => live && setPrices(null));
        setCards(c)
          .then((m) => {
            if (!live) return;
            setGroupId(m.groupId);
            setMore(m.cards);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // The card's identity, not the object: edits to paid or plan don't reload prices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  // The card's own price (the vault store, what the top of its page shows) wins for its grade,
  // so the page never shows two prices for one grade. Other grades come from the search fetch.
  const own = card.grader === 'psa' || card.grader === 'raw' ? priceFor(card) : null;
  const shown = prices && own ? withOwn(prices, pick, own) : prices;

  if (!cat) return null;
  const open = (g: Choice) =>
    router.push({ pathname: '/search/[id]', params: { id: String(cat.productId), grade: g, ...(con ? { con: '1' } : {}) } });
  const other = card.grader === 'bgs' || card.grader === 'cgc';
  return (
    <View>
      {other && prices ? (
        <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xl }]}>
          Stats below are for PSA {pick.slice(3)}. Slabby doesn’t track {card.grader.toUpperCase()} sales yet.
        </Text>
      ) : null}
      <CardAnalyticsView
        pick={pick}
        prices={shown}
        own={!!own}
        setName={cat.setName}
        more={more}
        onPick={(g) => (g === pick ? undefined : open(g))}
        onAll={groupId != null ? () => openSetPage(cat, groupId) : undefined}
        con={con}
      />
    </View>
  );
}

/** Search prices with one grade (or raw) replaced by the card's own price. */
export function withOwn(prices: SearchPrices, pick: Choice, own: CardPrice): SearchPrices {
  return pick === 'raw' ? { ...prices, raw: own } : { ...prices, grades: { ...prices.grades, [pick]: own } };
}

/**
 * Key stats for the picked grade, stock-app style: a one-line read, then label-over-number cells
 * two to a row. A stat with too little behind it is left out, never shown as a dash. Math lives
 * in src/pricing/cardStats.ts.
 */
export function KeyStats({ pick, price, prices }: { pick: Choice; price: CardPrice; prices: SearchPrices }) {
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
          : price.basis === 'median5'
            ? 'eBay sold, median of the last 5 sales. Ratios need 5 sales on each side.'
            : price.basis === 'lastSold'
              ? 'eBay sold, last sale (too few for a median). Ratios need 5 sales on each side.'
              : 'eBay sold, 30-day median. Ratios need 5 sales on each side.'}
      </Text>
    </View>
  );
}

/**
 * Key stats for a grade with a price but no sale in 30 days: the last sale, how many days had a
 * sale in 90, the headline price and the 90-day range of sales. Bryan wants every price to
 * show where it came from, so a thin price gets its numbers with the caveat, never a bare figure.
 */
/** What the headline number is, for a stat label. */
function priceLabel(p: CardPrice): string {
  return p.basis === 'median5' ? 'Median, last 5 sales' : p.basis === 'lastSold' ? 'Last sold price' : 'Last 30-day price';
}

export function ThinStats({ price }: { price: CardPrice }) {
  const t = thinRead(price);
  if (!t) return null;
  const cells = [
    { label: 'Last sale', value: t.lastSale ? shortDay(t.lastSale) : null },
    { label: 'Days with a sale, 90 days', value: String(t.saleDays) },
    { label: priceLabel(price), value: money(price.marketCents) },
    { label: 'Range, 90 days', value: t.low != null && t.high != null ? `${money(t.low)}–${money(t.high).replace('$', '')}` : null },
  ].filter((c): c is { label: string; value: string } => !!c.value);
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View style={{ paddingTop: space.xl }}>
      <Text style={[type.section, { color: color.ink }]}>Key stats</Text>
      <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
        {t.saleDays <= 1 ? 'Rarely sells' : `Thin · sales on ${t.saleDays} days in 90`} · no sale in the last 30 days
      </Text>
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
      <Text style={[type.caption, { color: color.secondary, paddingTop: space.m }]}>
        {price.basis === 'median5'
          ? 'eBay sold. The price is the median of the last 5 sales, however far back they go.'
          : price.basis === 'lastSold'
            ? 'eBay sold. Too few sales for a median, so the price is the last sale.'
            : 'eBay sold. The price is the median of the last 30 days that had sales, so it may be out of date.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: space.xl, paddingVertical: space.m },
  stat: { flex: 1, gap: 2 },
});
