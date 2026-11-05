// Home is the collection: what you own, shown on a shelf, one at a time, or as a grid.
// Con mode starts from here. Supersedes the 01-vault.png layout at Bryan's request (collection-first).

import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MiniChart } from '../src/components/MiniChart';
import { EmptyVault } from '../src/components/collection/EmptyVault';
import { FilterTabs } from '../src/components/collection/FilterTabs';
import { GridView } from '../src/components/collection/GridView';
import { ScrollDisplay } from '../src/components/collection/ScrollDisplay';
import { ShelfView } from '../src/components/collection/ShelfView';
import { ViewSwitch } from '../src/components/collection/ViewSwitch';
import { IconButton, PrimaryButton, ScanIcon } from '../src/components/ui';
import { money, monthLine } from '../src/lib/format';
import { collection, collectionSeries, rowFor, summarize, type CollectionFilter } from '../src/pricing/portfolio';
import { refreshPrices } from '../src/services/comps';
import { useDisplay } from '../src/store/display';
import { usePrices } from '../src/store/prices';
import { useRules } from '../src/store/rules';
import { useVault } from '../src/store/vault';
import { color, size, space, type } from '../src/theme/tokens';

const EMPTY: Record<CollectionFilter, string> = {
  all: 'Nothing here yet.',
  hold: 'Nothing on hold.',
  sell: 'Nothing marked for sale. Open a slab and set it to Sell.',
  sold: 'Nothing sold yet.',
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const contentW = screenW - space.gutter * 2;

  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const { mode, filter, setMode, setFilter } = useDisplay();

  useEffect(() => {
    refreshPrices(cards);
  }, [cards]);

  const all = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const summary = useMemo(() => summarize(all), [all]);
  const list = useMemo(() => collection(all, filter), [all, filter]);
  const valueLine = useMemo(() => (filter === 'sold' ? [] : collectionSeries(list.rows, 30)), [list, filter]);
  const owned = cards.filter((c) => c.status === 'owned').length;
  const isEmpty = cards.length === 0;

  const more = () => {
    const go = (i: number) => {
      if (i === 0) router.push('/add');
      if (i === 1) router.push('/settings/pricing');
      if (i === 2) router.push('/settings/account');
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Add by hand', 'Pricing rules', 'Back up', 'Cancel'], cancelButtonIndex: 3 },
        go,
      );
    } else {
      go(0);
    }
  };

  const count = list.rows.length;
  const subline =
    filter === 'all'
      ? [`${owned} ${owned === 1 ? 'slab' : 'slabs'}`, Math.abs(summary.monthDeltaCents) >= 100 ? monthLine(summary.monthDeltaCents) : null]
          .filter(Boolean)
          .join(' · ')
      : `${count} ${count === 1 ? 'slab' : 'slabs'}${filter === 'sold' ? ' sold' : ''}`;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: insets.bottom + size.button + space.xxxl + space.l }}
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
              {count > 0 ? <Text style={[type.displayS, { color: color.ink }]}>{money(list.totalCents)}</Text> : null}
              <Text style={[type.text, { color: color.secondary }]}>{subline}</Text>
              {valueLine.length > 1 ? (
                <View style={{ paddingTop: space.m }}>
                  <MiniChart values={valueLine} width={contentW} />
                </View>
              ) : null}
            </View>

            <View style={styles.controls}>
              <FilterTabs value={filter} onChange={setFilter} />
              <ViewSwitch value={mode} onChange={setMode} />
            </View>

            {count === 0 ? (
              <View style={styles.gutter}>
                <Text style={[type.text, { color: color.secondary, paddingTop: space.l }]}>{EMPTY[filter]}</Text>
              </View>
            ) : mode === 'scroll' ? (
              <ScrollDisplay key={filter} rows={list.rows} screenW={screenW} />
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

      <View style={[styles.dock, { paddingBottom: insets.bottom + space.s }]}>
        {isEmpty ? (
          <>
            <PrimaryButton title="Scan a slab" onPress={() => router.push('/scan')} />
            <Pressable accessibilityRole="link" onPress={() => router.push('/add')} style={styles.quiet}>
              <Text style={[type.text, { color: color.secondary }]}>Add by hand</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton title="Start con mode" onPress={() => router.push('/con')} />
        )}
      </View>
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
