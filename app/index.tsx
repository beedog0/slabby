// Home is the collection: what you own, shown on a shelf, one at a time, or as a grid.
// Con mode starts from the … menu. Supersedes the 01-vault.png layout at Bryan's request (collection-first).

import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
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
import { ArrangeShelf } from '../src/components/collection/ArrangeShelf';
import { EmptyFilter, EmptyVault } from '../src/components/collection/EmptyVault';
import { FilterTabs } from '../src/components/collection/FilterTabs';
import { GridView } from '../src/components/collection/GridView';
import { ScrollDisplay } from '../src/components/collection/ScrollDisplay';
import { SearchSort } from '../src/components/collection/SearchSort';
import type { SlabActions } from '../src/components/collection/actions';
import { removeWithUndo } from '../src/components/collection/remove';
import { openDropdown } from '../src/components/menu/Dropdown';
import { openSlabMenu } from '../src/components/menu/Menu';
import { MAX_SHARE, shareSlab, shareSlabs } from '../src/components/share/ShareCard';
import { arrange } from '../src/pricing/arrange';
import { shareSellSheet } from '../src/services/sellSheet';
import { DEFAULT_CON_NAME } from '../src/store/con';
import { ShelfView } from '../src/components/collection/ShelfView';
import { ViewSwitch } from '../src/components/collection/ViewSwitch';
import { IconButton, PrimaryButton, ScanIcon } from '../src/components/ui';
import { money, monthLine, rowTitle } from '../src/lib/format';
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
  const { mode, filter, sort, order, pinnedId, setMode, setFilter: saveFilter, setSort, setOrder, setPinned } = useDisplay();
  // Select mode: tap slabs to pick several, then share or remove them together.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // A new tab shows other slabs; a selection you can't see shouldn't be acted on.
  const setFilter = (f: CollectionFilter) => {
    setSelected(new Set());
    saveFilter(f);
  };

  useEffect(() => {
    refreshPrices(cards);
  }, [cards]);

  const all = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const base = useMemo(() => collection(all, filter), [all, filter]);
  const [query, setQuery] = useState('');
  // Arranging: hold a slab, drag it to its spot. Saves as "My order".
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState(false);
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
    doneSelecting();
    if (mode !== 'shelf') setMode('shelf');
    // Start from what's on screen, so the first drag doesn't reshuffle everything else.
    setOrder(arrange(base.rows, { sort, order, pinnedId }).map((r) => r.card.id));
    setSort('mine');
    setArranging(true);
  };
  const doneArranging = () => {
    setArranging(false);
    setDragging(false);
  };
  const startSelecting = (first?: string) => {
    setArranging(false);
    setSelected(new Set(first ? [first] : []));
    setSelecting(true);
  };
  const doneSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Grouped by when you'd reach for it: at the con, around the shelf, then settings.
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const more = () =>
    openDropdown(moreRef, [
      [
        { label: 'Con mode', onPress: () => router.push('/con') },
        {
          label: 'Sell sheet',
          onPress: () =>
            shareSellSheet(all, DEFAULT_CON_NAME).catch(() => Alert.alert('Couldn’t make the sell sheet')),
        },
      ],
      [
        { label: 'Select', onPress: () => startSelecting() },
        { label: 'Arrange shelf', onPress: startArranging },
        { label: 'Add by hand', onPress: () => router.push('/add') },
      ],
      [
        { label: 'Pricing rules', onPress: () => router.push('/settings/pricing') },
        { label: 'Back up', onPress: () => router.push('/settings/account') },
      ],
    ]);

  // Long-press any slab: pin it first, share it, open it, start a selection, or remove it.
  const slabMenu = (row: CardRow) => {
    const pinned = pinnedId === row.card.id;
    openSlabMenu(row.card, [
      [
        { label: pinned ? 'Unpin' : 'Pin to front', onPress: () => setPinned(pinned ? null : row.card.id) },
        { label: 'Share card', onPress: () => shareSlab(row.card) },
        { label: 'Open', onPress: () => router.push(`/card/${row.card.id}`) },
        { label: 'Select', onPress: () => startSelecting(row.card.id) },
      ],
      [{ label: 'Remove from vault', onPress: () => removeWithUndo([row.card]) }],
    ]);
  };

  const picks = useMemo(() => all.filter((r) => selected.has(r.card.id)).map((r) => r.card), [all, selected]);
  const allShown = list.rows.length > 0 && list.rows.every((r) => selected.has(r.card.id));
  const shareSelected = () => {
    if (picks.length > MAX_SHARE) Alert.alert(`Sharing the first ${MAX_SHARE}`, `One image fits up to ${MAX_SHARE} slabs.`);
    shareSlabs(picks);
  };
  const removeSelected = () => removeWithUndo(picks, doneSelecting);

  const actions: SlabActions = selecting
    ? { selected, onPress: (r) => toggle(r.card.id), onLongPress: (r) => toggle(r.card.id) }
    : { onLongPress: slabMenu };

  const count = list.rows.length;
  // The header counts the whole filter; a search only narrows the slabs below it.
  const total = base.rows.length;
  const empty = EMPTY[filter];
  const month = Math.abs(stats.monthDeltaCents) >= 100 ? monthLine(stats.monthDeltaCents) : null;
  const subline: ReactNode =
    filter === 'all' ? (
      [plural(total, 'slab'), month].filter(Boolean).join(' · ')
    ) : filter === 'hold' ? (
      total ? (
        [plural(total, 'hold'), month].filter(Boolean).join(' · ')
      ) : (
        'No holds'
      )
    ) : filter === 'sell' ? (
      total ? (
        `${total} for sale · floor ${money(stats.floorTotalCents)}`
      ) : (
        'Nothing for sale'
      )
    ) : total ? (
      <>
        {`${total} sold · `}
        <Text style={{ color: stats.profitCents >= 0 ? color.gain : color.loss }}>
          {money(Math.abs(stats.profitCents))}
        </Text>
        {stats.profitCents >= 0 ? ' over paid' : ' under paid'}
      </>
    ) : (
      'Nothing sold'
    );

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        scrollEnabled={!dragging}
        contentContainerStyle={{
          paddingTop: insets.top + space.l,
          // The dock only shows on an empty vault; a full vault scrolls to the bottom edge.
          paddingBottom:
            insets.bottom + (isEmpty || selecting ? size.button + space.xxxl + space.l : space.xxl),
        }}
      >
        <View style={styles.header}>
          <Text numberOfLines={1} style={[type.section, { color: color.ink }]}>
            {selecting ? (selected.size ? `${selected.size} selected` : 'Select slabs') : 'Slabby'}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            {selecting ? (
              <Pressable accessibilityRole="button" onPress={doneSelecting} style={styles.done}>
                <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>Done</Text>
              </Pressable>
            ) : arranging ? (
              <Pressable accessibilityRole="button" onPress={doneArranging} style={styles.done}>
                <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>Done</Text>
              </Pressable>
            ) : (
              <>
                <IconButton label="Scan a slab" onPress={() => router.push('/scan')}>
                  <ScanIcon />
                </IconButton>
                <View ref={moreRef} collapsable={false}>
                  <IconButton label="More" onPress={more}>
                    <MoreIcon />
                  </IconButton>
                </View>
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
                {VALUE_LABEL[filter]}
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
              {selecting ? (
                <View style={styles.selectRow}>
                  <Text style={[type.text, { color: color.secondary }]}>Tap slabs to select them.</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelected(allShown ? new Set() : new Set(list.rows.map((r) => r.card.id)))}
                    style={styles.selectAll}
                  >
                    <Text style={[type.text, { color: color.ink }]}>{allShown ? 'Deselect all' : 'Select all'}</Text>
                  </Pressable>
                </View>
              ) : arranging ? (
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
                  Hold a slab, then drag it to its spot.
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
            ) : mode === 'scroll' && !selecting ? (
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
                {/* Selecting from the swipe view shows the grid, so several slabs are in reach. */}
                {arranging ? (
                  <ArrangeShelf
                    rows={list.rows}
                    width={contentW}
                    pinnedId={pinnedId}
                    order={order}
                    onOrder={setOrder}
                    onDragChange={setDragging}
                  />
                ) : mode === 'shelf' ? (
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
      ) : selecting && picks.length ? (
        <View style={[styles.dock, { paddingBottom: insets.bottom + space.s }]}>
          <PrimaryButton title={`Share ${plural(picks.length, 'slab')}`} onPress={shareSelected} />
          <Pressable accessibilityRole="button" onPress={removeSelected} style={styles.quiet}>
            <Text style={[type.text, { color: color.secondary }]}>Remove {plural(picks.length, 'slab')}</Text>
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
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: size.touch },
  selectAll: { height: size.touch, justifyContent: 'center', paddingLeft: space.m },
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
