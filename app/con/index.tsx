// Con mode: sold today, floor total, for-sale list with ask and floor. Reference: 05-con-mode.png.

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConRow } from '../../src/components/ConRow';
import { Segmented } from '../../src/components/Segmented';
import { Hairline, PrimaryButton, ScanIcon, SearchIcon } from '../../src/components/ui';
import { elapsed, money } from '../../src/lib/format';
import { conSummary, rowFor } from '../../src/pricing/portfolio';
import { DEFAULT_CON_NAME, useCon } from '../../src/store/con';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { color, radius, size, space, type } from '../../src/theme/tokens';

type Tab = 'sale' | 'sold' | 'trade';

export default function ConMode() {
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const { session, start, end } = useCon();
  const [tab, setTab] = useState<Tab>('sale');
  const [, tick] = useState(0);

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

  const visible = rows.filter((r) => {
    const c = r.card;
    if (tab === 'sold') return c.status === 'sold' && !!c.soldAt && c.soldAt >= session.startedAt;
    if (tab === 'trade') return c.status === 'owned' && c.plan === 'trade';
    return c.status === 'owned' && c.plan === 'sell';
  });

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

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.m, paddingBottom: space.xxl }}>
        {visible.map((r) => (
          <View key={r.card.id}>
            <ConRow row={r} onPress={() => r.card.status === 'owned' && router.push(`/con/table/${r.card.id}`)} />
            <Hairline inset={size.thumbW + space.m} />
          </View>
        ))}
        {visible.length === 0 ? (
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
            {tab === 'sold' ? 'Nothing sold yet.' : tab === 'trade' ? 'No cards marked trade only.' : 'No cards marked for sale.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
        <PrimaryButton style={{ flex: 1 }} title="Got an offer" onPress={() => router.push('/con/pick')} />
        <Pressable accessibilityRole="button" accessibilityLabel="Search a card to buy" onPress={() => router.push('/search?con=1')} style={styles.scan}>
          <SearchIcon />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan a slab" onPress={() => router.push('/scan')} style={styles.scan}>
          <ScanIcon />
        </Pressable>
      </View>
    </View>
  );
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
  footer: { flexDirection: 'row', gap: space.m, paddingHorizontal: space.gutter, paddingTop: space.s },
  scan: {
    width: size.button,
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
