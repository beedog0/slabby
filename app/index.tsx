// Home is the collection: what you own, shown on a shelf, one at a time, or as a grid.
// Con mode starts from the … menu. Supersedes the 01-vault.png layout at Bryan's request (collection-first).

import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ValueChart } from '../src/components/MiniChart';
import { EmptyFilter, EmptyVault } from '../src/components/collection/EmptyVault';
import { FilterTabs } from '../src/components/collection/FilterTabs';
import { GridView } from '../src/components/collection/GridView';
import { ScrollDisplay } from '../src/components/collection/ScrollDisplay';
import { SearchSort } from '../src/components/collection/SearchSort';
import type { SlabActions } from '../src/components/collection/actions';
import { shareSlab } from '../src/components/share/ShareCard';
import { arrange, swapOrder } from '../src/pricing/arrange';
import { shareSellSheet } from '../src/services/sellSheet';
import { DEFAULT_CON_NAME } from '../src/store/con';
import { ShelfView } from '../src/components/collection/ShelfView';
import { ViewSwitch } from '../src/components/collection/ViewSwitch';
import { IconButton, PrimaryButton, ScanIcon } from '../src/components/ui';
import { changeText, money, rowTitle } from '../src/lib/format';
import {
  collection,
  collectionSeries,
  filterStats,
  rowFor,
  soldSeries,
  type CardRow,
  type CollectionFilter,
} from '../src/pricing/portfolio';
import { refreshPrices } from '../src/services/comps';
import { useDisplay } from '../src/store/display';
import { usePrices } from '../src/store/prices';
import { useRules } from '../src/store/rules';
import { useVault } from '../src/store/vault';
import { color, size, space, type } from '../src/theme/tokens';

// Every filter fills the same header lines (value, one line, chart slot) so the tabs never move.
const EMPTY: Record<CollectionFilter, { title: string; hint: string; chart: string }> = {
  all: { title: 'Nothing here yet', hint: 'Scan a slab to add it.', chart: '' },
  hold: {
    title: 'No holds yet',
    hint: 'Open a slab and set it to Hold to keep it out of con mode.',
    chart: 'Your holds’ value over 30 days shows here.',
  },
  sell: {
    title: 'Nothing for sale',
    hint: 'Open a slab and set it to Sell. It shows up in con mode with its ask and floor.',
    chart: 'What your for-sale slabs are worth shows here.',
  },
  sold: {
    title: 'Nothing sold yet',
    hint: 'Slabs you sell in con mode land here with what they went for.',
    chart: 'Your sales add up here over 30 days.',
  },
};

/** What the big number is, per tab. Market value for owned slabs; what they sold for on Sold. */
const VALUE_LABEL: Record<CollectionFilter, string> = {
  all: 'Collection value',
  hold: 'Holds value',
  sell: 'For sale value',
  sold: 'Sold total',
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Where the display starts in the page; the swipe view sizes its slab to fit below it.
  const [displayY, setDisplayY] = useState(0);
  const contentW = screenW - space.gutter * 2;

  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const { mode, filter, sort, order, pinnedId, setMode, setFilter, setSort, setOrder, setPinned } = useDisplay();

  useEffect(() => {
    refreshPrices(cards);
  }, [cards]);

  const all = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const base = useMemo(() => collection(all, filter), [all, filter]);
  const [query, setQuery] = useState('');
  // Arranging: tap one slab, then another, to swap them. Saves as "My order".
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = useMemo(
    () =>
      arrange(base.rows, {
        sort: arranging ? 'mine' : sort,
        query,
        order,
        pinnedId,
      }),
    [base, sort, query, order, pinnedId, arranging],
  );
  const list = useMemo(() => ({ rows: shown, totalCents: base.totalCents }), [shown, base]);
  const asOf = useMemo(
    () =>
      base.rows
        .map((r) => r.price?.asOf)
        .filter((d): d is string => !!d)
        .sort()
        .pop(),
    [base],
  );
  // Header numbers describe the whole filter, not just the search results, so they hold still.
  const stats = useMemo(() => filterStats(base.rows), [base]);
  const valueLine = useMemo(() => {
    if (filter !== 'sold') return collectionSeries(base.rows, 30);
    const s = soldSeries(base.rows, 30);
    return s[s.length - 1] > 0 ? s : [];
  }, [base, filter]);
  const isEmpty = cards.length === 0;

  const startArranging = () => {
    setQuery('');
    setPicked(null);
    if (mode === 'scroll') setMode('shelf');
    setArranging(true);
  };
  const doneArranging = () => {
    setArranging(false);
    setPicked(null);
    setSort('mine');
  };

  const more = () => {
    const items: [string, () => void][] = [
      ['Con mode', () => router.push('/con')],
      [
        'Sell sheet',
        () => shareSellSheet(all, DEFAULT_CON_NAME).catch(() => Alert.alert('Couldn’t make the sell sheet')),
      ],
      ['Arrange shelf', startArranging],
      ['Add by hand', () => router.push('/add')],
      ['Pricing rules', () => router.push('/settings/pricing')],
      ['Back up', () => router.push('/settings/account')],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...items.map(([t]) => t), 'Cancel'],
          cancelButtonIndex: items.length,
        },
        (i) => items[i]?.[1](),
      );
    } else {
      items[3][1]();
    }
  };

  // Long-press any slab: pin it first, share it, or open it.
  const slabMenu = (row: CardRow) => {
    const pinned = pinnedId === row.card.id;
    const items: [string, () => void][] = [
      [pinned ? 'Unpin' : 'Pin to front', () => setPinned(pinned ? null : row.card.id)],
      ['Share card', () => shareSlab(row.card)],
      ['Open', () => router.push(`/card/${row.card.id}`)],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: rowTitle(row.card),
          options: [...items.map(([t]) => t), 'Cancel'],
          cancelButtonIndex: items.length,
        },
        (i) => items[i]?.[1](),
      );
    } else {
      items[0][1]();
    }
  };

  const actions: SlabActions = arranging
    ? {
        selectedId: picked,
        onPress: (r) => {
          if (!picked) return setPicked(r.card.id);
          if (picked !== r.card.id)
            setOrder(
              swapOrder(
                order,
                list.rows.map((x) => x.card.id),
                picked,
                r.card.id,
              ),
            );
          setPicked(null);
        },
      }
    : { onLongPress: slabMenu };

  const count = list.rows.length;
  // The header counts the whole filter; a search only narrows the slabs below it.
  const total = base.rows.length;
  const empty = EMPTY[filter];
  // "−$10 (−2.1%) this month", the numbers in gain or loss color, words in secondary.
  const change = changeText(stats.monthDeltaCents, stats.totalCents);
  const month = change ? (
    <>
      <Text style={{ color: stats.monthDeltaCents > 0 ? color.gain : color.loss }}>{change}</Text>
      {' this month'}
    </>
  ) : null;
  // Line above the number: what it is, and how many slabs it counts.
  const label = `${VALUE_LABEL[filter]} · ${plural(total, 'slab')}`;
  // Line under the number: how that value moved (or, for sale and sold, the number that matters there).
  const subline: ReactNode =
    filter === 'sell' ? (
      total ? (
        `Floor ${money(stats.floorTotalCents)}`
      ) : (
        'Nothing for sale'
      )
    ) : filter === 'sold' ? (
      total ? (
        <>
          <Text style={{ color: stats.profitCents >= 0 ? color.gain : color.loss }}>
            {`${stats.profitCents >= 0 ? '+' : '−'}${money(Math.abs(stats.profitCents))}`}
          </Text>
          {stats.profitCents >= 0 ? ' over what you paid' : ' under what you paid'}
        </>
      ) : (
        'Nothing sold yet'
      )
    ) : !total ? (
      filter === 'hold' ? (
        'No holds yet'
      ) : (
        'Nothing here yet'
      )
    ) : (
      (month ?? 'Flat this month')
    );

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.l,
          // The dock only shows on an empty vault; a full vault scrolls to the bottom edge.
          paddingBottom: insets.bottom + (isEmpty ? size.button + space.xxxl + space.l : space.xxl),
        }}
      >
        <View style={styles.header}>
          <Text style={[type.section, { color: color.ink }]}>Slabby</Text>
          <View style={{ flexDirection: 'row' }}>
            {arranging ? (
              <Pressable accessibilityRole="button" onPress={doneArranging} style={styles.done}>
                <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>Done</Text>
              </Pressable>
            ) : (
              <>
                <IconButton label="Scan a slab" onPress={() => router.push('/scan')}>
                  <ScanIcon />
                </IconButton>
                <IconButton label="More" onPress={more}>
                  <MoreIcon />
                </IconButton>
              </>
            )}
          </View>
        </View>

        {isEmpty ? (
          <EmptyVault />
        ) : (
          <>
            <View style={styles.value}>
              <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                {label}
              </Text>
              <Text numberOfLines={1} style={[type.displayS, { color: total ? color.ink : color.secondary }]}>
                {money(stats.totalCents)}
              </Text>
              <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
                {subline}
              </Text>
              <View style={styles.chart}>
                {valueLine.length > 1 ? (
                  <ValueChart values={valueLine} width={contentW} asOf={filter === 'sold' ? undefined : asOf} />
                ) : (
                  <ChartPlaceholder text={total ? 'Prices are loading.' : empty.chart} />
                )}
              </View>
            </View>

            <View style={styles.controls}>
              <FilterTabs value={filter} onChange={setFilter} />
              <ViewSwitch value={mode} onChange={setMode} />
            </View>
            {/* Every view gets search and sort; the swipe view sizes its slab to the room left below. */}
            <View style={styles.search}>
              {arranging ? (
                <Text
                  style={[
                    type.text,
                    {
                      color: color.secondary,
                      height: size.touch,
                      lineHeight: size.touch,
                    },
                  ]}
                >
                  {picked ? 'Now tap where it should go.' : 'Tap a slab, then tap another to swap them.'}
                </Text>
              ) : (
                <SearchSort query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
              )}
            </View>

            {count === 0 && query ? (
              <View style={styles.gutter}>
                <Text style={[type.text, { color: color.secondary, paddingTop: space.l }]}>
                  No slabs match “{query.trim()}”.
                </Text>
              </View>
            ) : count === 0 ? (
              <View style={styles.gutter}>
                <EmptyFilter mode={mode} width={contentW} title={empty.title} hint={empty.hint} />
              </View>
            ) : mode === 'scroll' ? (
              <View onLayout={(e) => setDisplayY(e.nativeEvent.layout.y)}>
                <ScrollDisplay
                  key={filter}
                  rows={list.rows}
                  screenW={screenW}
                  onLongPress={slabMenu}
                  fitHeight={displayY ? screenH - displayY - insets.bottom - space.s : undefined}
                />
              </View>
            ) : (
              <View style={styles.gutter}>
                {mode === 'shelf' ? (
                  <ShelfView rows={list.rows} width={contentW} actions={actions} />
                ) : (
                  <GridView rows={list.rows} width={contentW} actions={actions} />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Con mode lives in the … menu; the dock is only for getting the first slab in. */}
      {isEmpty ? (
        <View style={[styles.dock, { paddingBottom: insets.bottom + space.s }]}>
          <PrimaryButton title="Scan a slab" onPress={() => router.push('/scan')} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/add')} style={styles.quiet}>
            <Text style={[type.text, { color: color.secondary }]}>Add by hand</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/** Holds the chart's place when there is nothing to draw: a baseline and one quiet line. */
function ChartPlaceholder({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      {text ? <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.s }]}>{text}</Text> : null}
      <View
        style={{
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: color.hairline,
        }}
      />
    </View>
  );
}

function MoreIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.ink}>
      <Circle cx={5.5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={18.5} cy={12} r={1.6} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: space.gutter,
    paddingRight: space.gutter - 10,
  },
  value: { gap: 4, paddingHorizontal: space.gutter, paddingTop: space.xl },
  chart: { height: size.homeChart, marginTop: space.m },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.gutter,
    paddingRight: space.gutter - 10,
    paddingTop: space.l,
    paddingBottom: space.xl,
  },
  search: {
    paddingHorizontal: space.gutter,
    paddingBottom: space.l,
    marginTop: -space.s,
  },
  done: { height: size.touch, paddingHorizontal: 10, justifyContent: 'center' },
  quiet: {
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
    paddingTop: space.s,
    backgroundColor: color.canvas,
  },
});
