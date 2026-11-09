// The Con tab: the stop before con mode, so the tab behaves like the others instead of throwing
// you into a running con (Bryan: that "feels a little off"), and a page worth opening between cons.
//
// Top to bottom: the con (live clock while one runs) with its one button, Start or Open con mode;
// your last day of sales (or today's, live); Selling / Buying with what you're bringing (slabs
// with ask and floor, or the wishlist with what you'll pay); recent sales; then quiet tools.

import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { Hairline, PrimaryButton } from '../../src/components/ui';
import { elapsed, money, rulePct, saleDay } from '../../src/lib/format';
import { conSummary, rowFor } from '../../src/pricing/portfolio';
import { lastSalesDay, recentSales, tableReady } from '../../src/pricing/tableReady';
import { displayName } from '../../src/services/search';
import { DEFAULT_CON_NAME, useCon, type ConMode } from '../../src/store/con';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { useWishlist } from '../../src/store/wishlist';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

const COLS = 3;
const SHOWN = 6;
const THUMB_W = 40;

export default function ConTab() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, mode, setMode } = useCon();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const wished = useWishlist((s) => s.items);
  const [, tick] = useState(0);

  // Keep the running con's clock current.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [session]);

  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const table = useMemo(() => tableReady(rows), [rows]);
  const lastDay = useMemo(() => lastSalesDay(rows), [rows]);
  const sales = useMemo(() => recentSales(rows, 5), [rows]);
  const today = session ? conSummary(rows, session.startedAt) : null;
  const cellW = Math.floor((width - space.gutter * 2 - space.m * (COLS - 1)) / COLS);
  const artH = Math.round((cellW * 88) / 63);
  const signed = (c: number) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;

  const go = () => {
    if (!session) useCon.getState().start(DEFAULT_CON_NAME);
    // start() opens on Selling; keep the side picked here.
    useCon.getState().setMode(mode);
    router.push('/con');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl }}
    >
      {/* The con, and its one button. */}
      <View style={styles.gutter}>
        {session ? (
          <View style={styles.live}>
            <View style={styles.dot} />
            <Text style={[type.secondary, { color: color.conText, fontWeight: '500' }]}>Live · {elapsed(session.startedAt)}</Text>
          </View>
        ) : null}
        <Text style={[type.title, { color: color.ink }]}>{session ? session.name : 'Con'}</Text>
        <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
          {session ? 'Your table is open. Prices and offers are in con mode.' : 'Your prices, ready before you walk up to a table.'}
        </Text>
        <PrimaryButton style={{ marginTop: space.xl }} title={session ? 'Open con mode' : 'Start con mode'} onPress={go} />
      </View>

      {/* Today's numbers while a con runs; otherwise how your last selling day went. */}
      {session && today ? (
        <View style={styles.figures}>
          <Figure value={money(today.soldCents)} label="Sold today" />
          <Figure value={String(today.soldCount)} label={today.soldCount === 1 ? 'Card' : 'Cards'} />
          <Figure value={money(today.floorTotalCents)} label="Left at floor" />
        </View>
      ) : lastDay ? (
        <Section title="Last sales day" detail={saleDay(lastDay.day)}>
          <View style={styles.figuresInline}>
            <Figure value={money(lastDay.soldCents)} label="Sold" />
            <Figure value={String(lastDay.count)} label={lastDay.count === 1 ? 'Card' : 'Cards'} />
            <Figure
              value={signed(lastDay.profitCents)}
              tint={lastDay.profitCents >= 0 ? color.gain : color.loss}
              label="Profit"
            />
          </View>
        </Section>
      ) : null}

      {/* What you're bringing. */}
      <Section title="Your table">
        <View style={styles.gutter}>
          <Segmented<ConMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sell', label: 'Selling' },
              { value: 'buy', label: 'Buying' },
            ]}
          />
        </View>

        {mode === 'sell' ? (
          <>
            <View style={styles.figuresInline}>
              <Figure value={String(table.forSale.length)} label="For sale" />
              <Figure value={money(table.askCents)} label="Asking" />
              <Figure value={money(table.floorCents)} label="Floor" />
            </View>
            {table.forSale.length ? (
              <View style={styles.grid}>
                {table.forSale.slice(0, SHOWN).map((r) => (
                  <Pressable key={r.card.id} accessibilityRole="button" onPress={() => router.push(`/card/${r.card.id}`)} style={{ width: cellW }}>
                    <SlabView card={r.card} width={cellW} posed={false} />
                    <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>
                      Ask {r.ask != null ? money(r.ask) : '—'}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: color.secondary }]}>
                      floor {r.floor != null ? money(r.floor) : '—'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[type.text, styles.note, { color: color.secondary }]}>
                Nothing is for sale yet. Open a slab and set it to Sell, or put slabs on the table from con mode.
              </Text>
            )}
            {table.forSale.length > SHOWN || table.tradeOnly ? (
              <Text style={[type.text, styles.note, { color: color.secondary, paddingTop: space.l }]}>
                {[table.forSale.length > SHOWN ? `${table.forSale.length - SHOWN} more for sale` : null, table.tradeOnly ? `${table.tradeOnly} trade only` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.figuresInline}>
              <Figure value={String(wished.length)} label="Wanted" />
              <Figure value={money(wished.reduce((t, w) => t + w.targetCents, 0))} label="Paying" />
              <View style={{ flex: 1 }} />
            </View>
            {wished.length ? (
              <View style={styles.grid}>
                {wished.slice(0, SHOWN).map((w) => (
                  <Pressable key={w.key} accessibilityRole="button" onPress={() => router.push(`/search/${w.productId}?con=1`)} style={{ width: cellW }}>
                    <View style={[styles.art, { height: artH }]}>
                      {w.imageUrl ? <ArtImage uri={w.imageUrl} recyclingKey={w.key} style={{ flex: 1 }} /> : null}
                    </View>
                    <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>
                      {displayName(w.name)}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: color.secondary }]}>
                      Paying {money(w.targetCents)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[type.text, styles.note, { color: color.secondary }]}>
                Your wishlist is empty. Search a card and add it with what you’d pay.
              </Text>
            )}
          </>
        )}
      </Section>

      {sales.length ? (
        <Section title="Recent sales">
          <View style={styles.gutter}>
            {sales.map((r, i) => {
              const c = r.card;
              const profit = c.soldCents != null && c.paidCents != null ? c.soldCents - c.paidCents : null;
              return (
                <View key={c.id}>
                  {i ? <Hairline inset={THUMB_W + space.m} /> : null}
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${c.id}`)} style={({ pressed }) => [styles.sale, pressed && { opacity: 0.6 }]}>
                    <SlabView card={c} width={THUMB_W} posed={false} shadow={false} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { color: color.ink }]}>{c.name}</Text>
                      <Text style={[type.secondary, { color: color.secondary }]}>Sold {saleDay(c.soldAt!)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type.numberM, { color: color.ink }]}>{c.soldCents != null ? money(c.soldCents) : '—'}</Text>
                      {profit != null ? (
                        <Text style={[type.caption, { color: profit >= 0 ? color.gain : color.loss }]}>{signed(profit)}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      <Section title="Tools">
        <View style={styles.gutter}>
          <Tool label="Search a card to buy" onPress={() => router.push('/search?con=1')} />
          <Hairline />
          <Tool
            label="Pricing rules"
            detail={`Ask ${rulePct(rules.askPct)} · floor ${rulePct(rules.floorPct)}`}
            onPress={() => router.push('/settings/pricing')}
          />
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={{ paddingTop: space.xxl }}>
      <View style={styles.sectionHead}>
        <Text style={[type.section, { color: color.ink }]}>{title}</Text>
        {detail ? <Text style={[type.text, { color: color.secondary }]}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Figure({ value, label, tint }: { value: string; label: string; tint?: string }) {
  const color = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: tint ?? color.ink }]}>
        {value}
      </Text>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
    </View>
  );
}

function Tool({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.6 }]}>
      <Text style={[type.body, { color: color.ink, flex: 1 }]}>{label}</Text>
      <Text style={[type.text, { color: color.secondary }]}>
        {detail ? `${detail}  ` : ''}›
      </Text>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 3 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.conFill },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: space.gutter,
      paddingBottom: space.m,
    },
    figures: { flexDirection: 'row', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.xxl },
    figuresInline: { flexDirection: 'row', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.l, paddingBottom: space.l },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m, rowGap: space.xl, paddingHorizontal: space.gutter, paddingTop: space.s },
    art: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    note: { paddingHorizontal: space.gutter },
    sale: { minHeight: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    tool: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center' },
  }),
);
