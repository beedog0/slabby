// Home is the collection: what you own, shown on a shelf, one at a time, or as a grid.
// Con mode starts from the … menu. Supersedes the 01-vault.png layout at Bryan's request (collection-first).

import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ValueChart } from '../src/components/MiniChart';
import { EmptyFilter, EmptyVault } from '../src/components/collection/EmptyVault';
import { FilterTabs } from '../src/components/collection/FilterTabs';
import { GridView } from '../src/components/collection/GridView';
import { ScrollDisplay } from '../src/components/collection/ScrollDisplay';
import { ShelfView } from '../src/components/collection/ShelfView';
import { ViewSwitch } from '../src/components/collection/ViewSwitch';
import { IconButton, PrimaryButton, ScanIcon } from '../src/components/ui';
import { money, monthLine } from '../src/lib/format';
import { collection, collectionSeries, filterStats, rowFor, soldSeries, type CollectionFilter } from '../src/pricing/portfolio';
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

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Where the display starts in the page; the swipe view sizes its slab to fit below it.
  const [displayY, setDisplayY] = useState(0);
  const contentW = screenW - space.gutter * 2;

  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const { mode, filter, setMode, setFilter } = useDisplay();

  useEffect(() => {
    refreshPrices(cards);
  }, [cards]);

  const all = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const list = useMemo(() => collection(all, filter), [all, filter]);
  const asOf = useMemo(
    () => list.rows.map((r) => r.price?.asOf).filter((d): d is string => !!d).sort().pop(),
    [list],
  );
  const stats = useMemo(() => filterStats(list.rows), [list]);
  const valueLine = useMemo(() => {
    if (filter !== 'sold') return collectionSeries(list.rows, 30);
    const s = soldSeries(list.rows, 30);
    return s[s.length - 1] > 0 ? s : [];
  }, [list, filter]);
  const isEmpty = cards.length === 0;

  const more = () => {
    const go = (i: number) => {
      if (i === 0) router.push('/con');
      if (i === 1) router.push('/add');
      if (i === 2) router.push('/settings/pricing');
      if (i === 3) router.push('/settings/account');
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Con mode', 'Add by hand', 'Pricing rules', 'Back up', 'Cancel'], cancelButtonIndex: 4 },
        go,
      );
    } else {
      go(1);
    }
  };

  const count = list.rows.length;
  const empty = EMPTY[filter];
  const month = Math.abs(stats.monthDeltaCents) >= 100 ? monthLine(stats.monthDeltaCents) : null;
  const subline: ReactNode =
    filter === 'all'
      ? [plural(count, 'slab'), month].filter(Boolean).join(' · ')
      : filter === 'hold'
        ? count
          ? [plural(count, 'hold'), month].filter(Boolean).join(' · ')
          : 'No holds'
        : filter === 'sell'
          ? count
            ? `${count} for sale · floor ${money(stats.floorTotalCents)}`
            : 'Nothing for sale'
          : count
            ? (
                <>
                  {`${count} sold · `}
                  <Text style={{ color: stats.profitCents >= 0 ? color.gain : color.loss }}>
                    {money(Math.abs(stats.profitCents))}
                  </Text>
                  {stats.profitCents >= 0 ? ' over paid' : ' under paid'}
                </>
              )
            : 'Nothing sold';

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
            <IconButton label="Scan a slab" onPress={() => router.push('/scan')}>
              <ScanIcon />
            </IconButton>
            <IconButton label="More" onPress={more}>
              <MoreIcon />
            </IconButton>
          </View>
        </View>

        {isEmpty ? (
          <EmptyVault />
        ) : (
          <>
            <View style={styles.value}>
              <Text numberOfLines={1} style={[type.displayS, { color: count ? color.ink : color.secondary }]}>
                {money(stats.totalCents)}
              </Text>
              <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
                {subline}
              </Text>
              <View style={styles.chart}>
                {valueLine.length > 1 ? (
                  <ValueChart values={valueLine} width={contentW} asOf={filter === 'sold' ? undefined : asOf} />
                ) : (
                  <ChartPlaceholder text={count ? 'Prices are loading.' : empty.chart} />
                )}
              </View>
            </View>

            <View style={styles.controls}>
              <FilterTabs value={filter} onChange={setFilter} />
              <ViewSwitch value={mode} onChange={setMode} />
            </View>

            {count === 0 ? (
              <View style={styles.gutter}>
                <EmptyFilter mode={mode} width={contentW} title={empty.title} hint={empty.hint} />
              </View>
            ) : mode === 'scroll' ? (
              <View onLayout={(e) => setDisplayY(e.nativeEvent.layout.y)}>
                <ScrollDisplay
                  key={filter}
                  rows={list.rows}
                  screenW={screenW}
                  fitHeight={displayY ? screenH - displayY - insets.bottom - space.s : undefined}
                />
              </View>
            ) : (
              <View style={styles.gutter}>
                {mode === 'shelf' ? (
                  <ShelfView rows={list.rows} width={contentW} />
                ) : (
                  <GridView rows={list.rows} width={contentW} />
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
      <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.hairline }} />
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
  quiet: { height: size.touch, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
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
