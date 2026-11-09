// The Con tab: the stop before con mode, so the tab behaves like the others instead of throwing
// you into a running con (Bryan: that "feels a little off"), and a page worth opening between cons.
//
// Top to bottom: the con (live clock while one runs) with its one button, Start or Open con mode,
// and a … for tools; today's numbers (live) or your last sales day; Selling / Buying with what
// you're bringing; then recent sales, or recent buys on Buying. Every row of numbers sits between
// hairlines with dividers between columns, so nothing floats (Bryan).

import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { openDropdown } from '../../src/components/menu/Dropdown';
import Svg, { Circle } from 'react-native-svg';
import { elapsed, money, saleDay } from '../../src/lib/format';
import { conSummary, rowFor, type CardRow } from '../../src/pricing/portfolio';
import { lastSalesDay, recentBuys, recentSales, tableReady } from '../../src/pricing/tableReady';
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
  const buys = useMemo(() => recentBuys(rows, 5), [rows]);
  const today = session ? conSummary(rows, session.startedAt) : null;
  const cellW = Math.floor((width - space.gutter * 2 - space.m * (COLS - 1)) / COLS);
  const artH = Math.round((cellW * 88) / 63);
  const signed = (c: number) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;

  const toolsRef = useRef<ComponentRef<typeof View>>(null);
  const tools = () =>
    openDropdown(toolsRef, [
      [
        { label: 'Search a card to buy', onPress: () => router.push('/search?con=1') },
        ...(wished.length ? [{ label: 'See wishlist', onPress: () => router.push('/wishlist') }, { label: 'Share wishlist', onPress: () => router.push('/share-wishlist') }] : []),
      ],
      [{ label: 'Pricing rules', onPress: () => router.push('/settings/pricing') }],
    ]);

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
        <View style={styles.titleRow}>
          <Text style={[type.title, { color: color.ink, flex: 1 }]}>{session ? session.name : 'Con'}</Text>
          <View ref={toolsRef} collapsable={false}>
            <IconButton label="Con tools" onPress={tools}>
              <MoreIcon />
            </IconButton>
          </View>
        </View>
        <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
          {session ? 'Your table is open. Prices and offers are in con mode.' : 'Your prices, ready before you walk up to a table.'}
        </Text>
        <PrimaryButton style={{ marginTop: space.xl }} title={session ? 'Open con mode' : 'Start con mode'} onPress={go} />
      </View>

      {/* Today's numbers while a con runs; otherwise how your last selling day went. */}
      {session && today ? (
        <Section title="Today">
          <Strip
            items={[
              { value: money(today.soldCents), label: 'Sold' },
              { value: String(today.soldCount), label: today.soldCount === 1 ? 'Card' : 'Cards' },
              { value: money(today.floorTotalCents), label: 'Left at floor' },
            ]}
          />
        </Section>
      ) : lastDay ? (
        <Section title="Last sales day" detail={saleDay(lastDay.day)}>
          <Strip
            items={[
              { value: money(lastDay.soldCents), label: 'Sold' },
              { value: String(lastDay.count), label: lastDay.count === 1 ? 'Card' : 'Cards' },
              { value: signed(lastDay.profitCents), label: 'Profit', tint: lastDay.profitCents >= 0 ? color.gain : color.loss },
            ]}
          />
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
            <Strip
              items={[
                { value: String(table.forSale.length), label: 'For sale' },
                { value: money(table.askCents), label: 'Asking' },
                { value: money(table.floorCents), label: 'Floor' },
              ]}
            />
            {table.forSale.length ? (
              <View style={styles.grid}>
                {table.forSale.slice(0, SHOWN).map((r) => (
                  <Pressable key={r.card.id} accessibilityRole="button" onPress={() => router.push(`/card/${r.card.id}`)} style={{ width: cellW }}>
                    <SlabView card={r.card} width={cellW} posed={false} anchor="bottom" />
                    <Text style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>Ask {r.ask != null ? money(r.ask) : '—'}</Text>
                    <Text style={[type.caption, { color: color.secondary }]}>floor {r.floor != null ? money(r.floor) : '—'}</Text>
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
            <Strip
              items={[
                { value: String(wished.length), label: 'Wanted' },
                { value: money(wished.reduce((t, w) => t + w.targetCents, 0)), label: 'Paying' },
              ]}
            />
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

      {/* What moved lately on this side of the table. */}
      {mode === 'sell' && sales.length ? (
        <Section title="Recent sales">
          <View style={styles.gutter}>
            {sales.map((r, i) => (
              <Deal
                key={r.card.id}
                row={r}
                first={i === 0}
                line={`Sold ${saleDay(r.card.soldAt!)}`}
                cents={r.card.soldCents}
                delta={r.card.soldCents != null && r.card.paidCents != null ? r.card.soldCents - r.card.paidCents : null}
              />
            ))}
            <Hairline />
          </View>
        </Section>
      ) : mode === 'buy' && buys.length ? (
        <Section title="Recent buys">
          <View style={styles.gutter}>
            {buys.map((r, i) => (
              <Deal
                key={r.card.id}
                row={r}
                first={i === 0}
                line={`Paid ${saleDay(r.card.paidAt ?? r.card.createdAt)}`}
                cents={r.card.paidCents}
                // How the buy is doing now: market minus paid (sold ones: what they went for).
                delta={
                  r.card.paidCents == null
                    ? null
                    : r.card.status === 'sold'
                      ? (r.card.soldCents ?? r.card.paidCents) - r.card.paidCents
                      : r.price
                        ? r.price.marketCents - r.card.paidCents
                        : null
                }
              />
            ))}
            <Hairline />
          </View>
        </Section>
      ) : null}
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

/** A row of numbers between hairlines, a divider between columns: label on top, number under it. */
function Strip({ items }: { items: { value: string; label: string; tint?: string }[] }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={styles.strip}>
      {items.map((it, i) => (
        <View key={it.label} style={[styles.cell, i > 0 && styles.cellDivider]}>
          <Text style={[type.secondary, { color: color.secondary }]}>{it.label}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: it.tint ?? color.ink }]}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One sale or buy: the slab, name and day, then the price and how it did. */
function Deal({ row, first, line, cents, delta }: { row: CardRow; first: boolean; line: string; cents: number | null; delta: number | null }) {
  const color = useColors();
  const styles = useStyles();
  const c = row.card;
  return (
    <View>
      <Hairline />
      <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${c.id}`)} style={({ pressed }) => [styles.deal, pressed && { opacity: 0.6 }]}>
        <SlabView card={c} width={THUMB_W} posed={false} shadow={false} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { color: color.ink }]}>{c.name}</Text>
          <Text style={[type.secondary, { color: color.secondary }]}>{line}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.numberM, { color: color.ink }]}>{cents != null ? money(cents) : '—'}</Text>
          {delta != null ? (
            <Text style={[type.caption, { color: delta >= 0 ? color.gain : color.loss }]}>{`${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}`}</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function MoreIcon() {
  const color = useColors();
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.ink}>
      <Circle cx={5.5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={18.5} cy={12} r={1.6} />
    </Svg>
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
    titleRow: { flexDirection: 'row', alignItems: 'center', marginRight: -10 },
    strip: {
      flexDirection: 'row',
      marginHorizontal: space.gutter,
      marginTop: space.m,
      marginBottom: space.l,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      borderBottomWidth: StyleSheet.hairlineWidth * 2,
      borderColor: color.hairline,
    },
    cell: { flex: 1, gap: 2, paddingVertical: space.m, paddingLeft: space.m },
    cellDivider: { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color.hairline },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m, rowGap: space.xl, paddingHorizontal: space.gutter, paddingTop: space.s },
    art: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    note: { paddingHorizontal: space.gutter },
    deal: { minHeight: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  }),
);
