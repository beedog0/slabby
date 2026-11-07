// Recent sales, pushed from Slab detail's comps row. Median and range up top, then one row per
// sale (when the server has individual listings) or per day (daily averages). Quick info first;
// the eBay search is the last row. Reference: designer spec in step 2 (no PNG yet).
// Route: app/card/[id]/sales.tsx sits beside app/card/[id].tsx; Expo Router serves both.

import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../../../src/components/CardThumb';
import { DotStrip } from '../../../src/components/DotStrip';
import { Segmented } from '../../../src/components/Segmented';
import { BackIcon, Chevron, Hairline, IconButton } from '../../../src/components/ui';
import { ebaySoldUrl } from '../../../src/lib/ebay';
import { cardLabel, money, rowTitle, saleDay, saleLine, salesWord, shortDay } from '../../../src/lib/format';
import { outlier, salesPoints, salesValues, summarize } from '../../../src/pricing/sales';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { refreshCard } from '../../../src/services/comps';
import type { SalesDays } from '../../../src/services/sales';
import { useSales } from '../../../src/services/useSales';
import { radius, size, space, type } from '../../../src/theme/tokens';
import { themed, useColors } from '../../../src/theme/theme';
import type { Card, Sale, SalesDay } from '../../../src/types';

type Range = '30' | '90';

const range = (lo: number, hi: number) => `${money(lo)}–${money(hi).replace('$', '')}`;

export default function SalesScreen() {
  const color = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const row = useCardRow(id);
  const [win, setWin] = useState<Range>('30');
  const days: SalesDays = win === '90' ? 90 : 30;
  const sales = useSales(row?.card, days);
  const [pulling, setPulling] = useState(false);
  const pullInFlight = useRef(false);

  if (!row) return null;
  const { card, price } = row;
  const result = sales.result;
  const values = result ? salesValues(result) : [];
  const points = result ? salesPoints(result) : [];
  const summary = summarize(values);
  const failed = sales.state === 'failed';
  const stale = failed && sales.fetchedAt ? `Couldn't update · showing sales from ${shortDay(sales.fetchedAt)}` : null;

  // One pull at a time; the spinner always clears, even when the refresh throws.
  const pull = async () => {
    if (pullInFlight.current) return;
    pullInFlight.current = true;
    setPulling(true);
    try {
      await refreshCard(card, { force: true }).catch(() => {});
      await sales.reload();
    } finally {
      pullInFlight.current = false;
      setPulling(false);
    }
  };

  // Header: the sales' median. With no rows (loading, none, or offline with nothing cached) the
  // cached price stands in, worded like Slab detail, so the header never disappears or jumps.
  let big: string | null = null;
  let line: string | null = null;
  if (summary) {
    big = money(summary.medianCents);
    line = stale ?? `median of ${salesWord(summary.count)} · ${range(summary.lowCents, summary.highCents)}`;
  } else if (price) {
    big = money(price.marketCents);
    line = card.grader === 'raw' || price.sales30d === 0 ? 'market' : `market · ${range(price.lowCents, price.highCents)}`;
  }

  const listW = width - space.gutter * 2;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} tintColor={color.secondary} />}
      >
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/card/${card.id}`))}>
            <BackIcon />
          </IconButton>
          <Text numberOfLines={1} style={[type.body, styles.navTitle]}>
            {rowTitle(card)} · {cardLabel(card)}
          </Text>
          <View style={{ width: size.touch }} />
        </View>

        <View style={styles.gutter}>
          {big ? (
            <View style={styles.header}>
              <Text style={[type.displayS, { color: color.ink }]}>{big}</Text>
              {line ? <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>{line}</Text> : null}
            </View>
          ) : null}
          {summary && points.length >= 5 ? (
            <View style={{ paddingBottom: space.l }}>
              <DotStrip
                points={points}
                values={values}
                medianCents={summary.medianCents}
                floorCents={row.floor}
                width={listW}
              />
            </View>
          ) : null}
          <View style={styles.rangeRow}>
            <Segmented<Range>
              style={{ width: size.rangeControl }}
              value={win}
              onChange={setWin}
              options={[
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
              ]}
            />
          </View>
          <Hairline />

          {result?.kind === 'sales' ? (
            result.rows.map((s, i) => (
              <View key={`${s.source}:${s.listingId}`}>
                {i ? <Hairline inset={size.thumbW + space.m} /> : null}
                <SaleRow card={card} sale={s} flag={outlier(s.priceCents, values)} />
              </View>
            ))
          ) : result?.kind === 'daily' ? (
            <>
              {result.rows.map((d, i) => (
                <View key={d.day}>
                  {i ? <Hairline /> : null}
                  <DayRow day={d} first={i === 0} />
                </View>
              ))}
            </>
          ) : result?.kind === 'none' ? (
            <View style={styles.empty}>
              <Text style={[type.text, { color: color.secondary }]}>
                {days === 30 ? 'No sales in 30 days.' : 'No sales in 90 days. Prices fill in when sales come in.'}
              </Text>
              {stale ? <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>{stale}</Text> : null}
              {days === 30 ? (
                <Pressable accessibilityRole="button" onPress={() => setWin('90')} hitSlop={12} style={{ paddingTop: space.m }}>
                  <Text style={[type.text, { color: color.ink }]}>Show 90 days</Text>
                </Pressable>
              ) : null}
            </View>
          ) : failed ? (
            <Text style={[type.text, styles.empty, { color: color.secondary }]}>Can't load sales offline. Pull to try again.</Text>
          ) : (
            <Skeleton />
          )}

          <Hairline />
          <Pressable
            accessibilityRole="link"
            accessibilityHint="Opens eBay sold listings"
            onPress={() => Linking.openURL(ebaySoldUrl(card)).catch(() => {})}
            style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.5 }]}
          >
            <Text style={[type.text, { color: color.secondary }]}>See all sold on eBay</Text>
            <Chevron />
          </Pressable>
          {result?.kind === 'daily' ? (
            <Text style={[type.caption, { color: color.secondary }]}>Daily averages from eBay and Fanatics sold listings.</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SaleRow({ card, sale, flag }: { card: Card; sale: Sale; flag: 'above' | 'below' | null }) {
  const color = useColors();
  const styles = useStyles();
  const sub = saleLine(sale) + (flag ? ` · well ${flag} range` : '');
  return (
    <Pressable
      accessibilityRole={sale.url ? 'link' : undefined}
      disabled={!sale.url}
      onPress={() => sale.url && Linking.openURL(sale.url).catch(() => {})}
      style={({ pressed }) => [styles.saleRow, pressed && { opacity: 0.5 }]}
    >
      <CardThumb card={card} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.line}>
          <Text style={[type.body, { color: color.ink }]}>{saleDay(sale.soldDay)}</Text>
          <Text style={[type.numberM, { color: flag ? color.secondary : color.ink }]}>{money(sale.priceCents)}</Text>
        </View>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

function DayRow({ day, first }: { day: SalesDay; first: boolean }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={styles.dayRow}>
      <View>
        <Text style={[type.body, { color: color.ink }]}>{saleDay(day.day)}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>{salesWord(day.sales)}</Text>
      </View>
      <Text style={[type.numberM, { color: color.ink }]}>
        {first ? <Text style={[type.secondary, { color: color.secondary }]}>avg </Text> : null}
        {money(day.avgCents)}
      </Text>
    </View>
  );
}

function Skeleton() {
  const styles = useStyles();
  return (
    <View accessibilityLabel="Loading sales">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonBar} />
        </View>
      ))}
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter - 10 },
  navTitle: { flex: 1, textAlign: 'center', color: color.ink },
  header: { paddingTop: space.xl, paddingBottom: space.xl },
  rangeRow: { flexDirection: 'row', paddingVertical: space.l },
  saleRow: { height: size.saleRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.m },
  dayRow: { height: size.dayRow, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { paddingVertical: space.xxl },
  seeAll: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xl },
  skeletonRow: { height: size.dayRow, justifyContent: 'center' },
  skeletonBar: { height: size.skeletonBar, borderRadius: radius.thumb, backgroundColor: color.well },
}));
