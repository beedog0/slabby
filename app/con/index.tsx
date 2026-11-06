// Con mode: sold today, floor total, for-sale list with ask and floor. Reference: 05-con-mode.png.
// The + beside "Got an offer" opens the "Put on the table" sheet: pick slabs from the vault and set
// Hold, For sale, Trade only or Sold without leaving con mode, or scan a new one. Long-press a row
// for the same choices. Whatever changed is flashed on the tab it landed on. Search and sort sit
// under the tabs, like on home.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConRow } from '../../src/components/ConRow';
import { SearchSort } from '../../src/components/collection/SearchSort';
import { Segmented } from '../../src/components/Segmented';
import { openConStatusMenu } from '../../src/components/conStatusMenu';
import { TableSheet, type TableSheetOpen } from '../../src/components/con/TableSheet';
import { Hairline, PlusIcon, PrimaryButton } from '../../src/components/ui';
import { conTabFor, type ConStatus } from '../../src/lib/conStatus';
import { elapsed, money } from '../../src/lib/format';
import { arrange, type SortKey } from '../../src/pricing/arrange';
import { conSummary, rowFor } from '../../src/pricing/portfolio';
import { conFreshnessLine } from '../../src/pricing/trend';
import { CON_MIN_AGE_MS, refreshCards } from '../../src/services/comps';
import { DEFAULT_CON_NAME, useCon } from '../../src/store/con';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { color, radius, size, space, type } from '../../src/theme/tokens';

type Tab = 'sale' | 'sold' | 'trade';

const CON_SORTS: SortKey[] = ['value', 'gain', 'newest', 'name'];

export default function ConMode() {
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const { session, start, end } = useCon();
  const [tab, setTab] = useState<Tab>('sale');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [sheet, setSheet] = useState<TableSheetOpen | null>(null);
  const [flash, setFlash] = useState<{ ids: string[]; at: number }>({ ids: [], at: 0 });
  /** Show where changed slabs went: the tab of the last change, with every changed row flashed. */
  const landOn = (changed: { id: string; status: ConStatus }[]) => {
    const last = changed[changed.length - 1];
    if (!last) return;
    setTab(conTabFor(last.status));
    setFlash({ ids: changed.map((c) => c.id), at: Date.now() });
  };
  // Back from the scanner: `at` makes a repeat of the same tab count.
  const params = useLocalSearchParams<{ tab?: Tab; flash?: string; at?: string }>();
  useEffect(() => {
    if (params.tab === 'sale' || params.tab === 'sold' || params.tab === 'trade') setTab(params.tab);
    if (params.flash) setFlash({ ids: [params.flash], at: Date.now() });
  }, [params.tab, params.flash, params.at]);
  const [, tick] = useState(0);
  const [refreshing, setRefreshing] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    if (!session) {
      start(DEFAULT_CON_NAME);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [session, start]);

  // Keep the session clock current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const prices = usePrices((s) => s.byKey);
  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  if (!session) return null;
  const sum = conSummary(rows, session.startedAt);
  // Cards on the table: for sale or trade only.
  const onTable = rows.filter((r) => r.card.status === 'owned' && (r.card.plan === 'sell' || r.card.plan === 'trade'));
  // Quiet during a pull (the spinner says it); the line shows only when behind or failed.
  const freshness = conFreshnessLine(
    onTable.flatMap((r) => (r.price ? [r.price] : [])),
    { failed: refreshFailed },
  );

  const pull = async () => {
    const list = onTable.map((r) => r.card);
    if (!list.length) return;
    setRefreshing(list.length);
    // Cards written in the last hour aren't worth a call.
    const statuses = await refreshCards(list, { force: true, minAgeMs: CON_MIN_AGE_MS });
    setRefreshFailed(statuses.some((s) => s === 'failed'));
    setRefreshing(0);
  };

  const onTab = rows.filter((r) => {
    const c = r.card;
    if (tab === 'sold') return c.status === 'sold' && !!c.soldAt && c.soldAt >= session.startedAt;
    if (tab === 'trade') return c.status === 'owned' && c.plan === 'trade';
    return c.status === 'owned' && c.plan === 'sell';
  });
  const visible = arrange(onTab, { sort, query });

  const done = () => {
    end();
    router.canGoBack() ? router.back() : router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top + space.l }}>
      <View style={styles.header}>
        <View style={{ gap: 3, flex: 1 }}>
          <View style={styles.indicator}>
            <View style={styles.dot} />
            <Text style={[type.secondary, { color: color.conText, fontWeight: '500' }]}>
              Con mode · {elapsed(session.startedAt)}
            </Text>
          </View>
          <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
            {session.name}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={done} style={styles.done}>
          <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.totals}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.displayS, { color: color.ink }]}>{money(sum.soldCents)}</Text>
          <Text style={[type.secondary, { color: color.secondary }]}>
            sold today · {sum.soldCount} of {sum.totalCount}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={[type.numberM, { color: color.ink }]}>{money(sum.floorTotalCents)}</Text>
          <Text style={[type.secondary, { color: color.secondary }]}>if everything hits floor</Text>
        </View>
      </View>
      {freshness ? (
        <Text numberOfLines={1} style={[type.secondary, styles.freshness, { color: color.secondary }]}>
          {freshness}
        </Text>
      ) : null}

      <Segmented<Tab>
        style={{ marginHorizontal: space.gutter, marginTop: space.xl }}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sale', label: 'For sale' },
          { value: 'sold', label: 'Sold' },
          { value: 'trade', label: 'Trade only' },
        ]}
      />

      <View style={{ marginHorizontal: space.gutter, marginTop: space.s }}>
        <SearchSort query={query} onQuery={setQuery} sort={sort} onSort={setSort} sorts={CON_SORTS} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing > 0} onRefresh={pull} tintColor={color.secondary} />}
      >
        {visible.map((r) => (
          <View key={r.card.id}>
            <Flash on={flash.ids.includes(r.card.id)} at={flash.at} />
            <ConRow
              row={r}
              onPress={() => r.card.status === 'owned' && router.push(`/con/table/${r.card.id}`)}
              onLongPress={
                r.card.status === 'owned'
                  ? () =>
                      openConStatusMenu(r.card, {
                        onChanged: (s) => landOn([{ id: r.card.id, status: s }]),
                        onSold: () => setSheet({ step: 'price', id: r.card.id }),
                      })
                  : undefined
              }
            />
            <Hairline inset={size.thumbW + space.m} />
          </View>
        ))}
        {visible.length === 0 ? (
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
            {query.trim() && onTab.length
              ? 'Nothing here matches.'
              : tab === 'sold'
                ? 'Nothing sold yet.'
                : tab === 'trade'
                  ? 'No cards marked trade only.'
                  : 'No cards marked for sale.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
        <PrimaryButton style={{ flex: 1 }} title="Got an offer" onPress={() => router.push('/con/pick')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a slab to the table"
          onPress={() => setSheet({ step: 'list' })}
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}
        >
          <PlusIcon />
        </Pressable>
      </View>

      <TableSheet
        open={sheet}
        onClose={(changed) => {
          setSheet(null);
          landOn(changed);
        }}
        onScan={() => router.push({ pathname: '/scan', params: { con: '1' } })}
      />
    </View>
  );
}

/** A brief well-colored wash behind a row that just changed, so you can see where it went. */
function Flash({ on, at }: { on: boolean; at: number }) {
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    o.setValue(1);
    Animated.timing(o, { toValue: 0, duration: 600, delay: 200, useNativeDriver: true }).start();
  }, [on, at, o]);
  return <Animated.View pointerEvents="none" style={[styles.flash, { opacity: o }]} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, gap: space.m },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.conFill },
  done: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: color.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totals: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.gutter, paddingTop: space.xl },
  flash: { position: 'absolute', top: 0, bottom: 0, left: -space.gutter, right: -space.gutter, backgroundColor: color.well },
  freshness: { paddingHorizontal: space.gutter, paddingTop: space.s },
  footer: { flexDirection: 'row', gap: space.m, paddingHorizontal: space.gutter, paddingTop: space.s },
  add: {
    width: size.button,
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
