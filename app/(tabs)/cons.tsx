// The Con tab: the stop before con mode, so the tab behaves like the others instead of throwing
// you straight into the con screen (Bryan: that "feels a little off").
//
// Pick Selling or Buying, see what you're bringing (slabs for sale with their asks, or your
// wishlist with what you'll pay), then one button: Start con mode. While a con is running the
// page says so and the button takes you back to it.

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { Segmented } from '../../src/components/Segmented';
import { SlabView } from '../../src/components/SlabView';
import { PrimaryButton } from '../../src/components/ui';
import { elapsed, money } from '../../src/lib/format';
import { conSummary, rowFor } from '../../src/pricing/portfolio';
import { tableReady } from '../../src/pricing/tableReady';
import { displayName } from '../../src/services/search';
import { DEFAULT_CON_NAME, useCon, type ConMode } from '../../src/store/con';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { useWishlist } from '../../src/store/wishlist';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

const COLS = 3;
const SHOWN = 9;

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
  const today = session ? conSummary(rows, session.startedAt) : null;
  const cellW = Math.floor((width - space.gutter * 2 - space.m * (COLS - 1)) / COLS);
  const artH = Math.round((cellW * 88) / 63);

  const go = () => {
    if (!session) useCon.getState().start(DEFAULT_CON_NAME);
    // start() opens on Selling; keep the side picked here.
    useCon.getState().setMode(mode);
    router.push('/con');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: insets.bottom + size.button + space.xxxl }}>
        <View style={styles.gutter}>
          {session ? (
            <View style={styles.live}>
              <View style={styles.dot} />
              <Text style={[type.secondary, { color: color.conText, fontWeight: '500' }]}>Con mode · {elapsed(session.startedAt)}</Text>
            </View>
          ) : null}
          <Text style={[type.title, { color: color.ink }]}>{session ? session.name : 'Con'}</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
            {session && today
              ? today.soldCount
                ? `${money(today.soldCents)} sold today · ${today.soldCount} ${today.soldCount === 1 ? 'card' : 'cards'}`
                : 'Nothing sold yet today'
              : 'Your prices, ready before you walk up to a table.'}
          </Text>

          <Segmented<ConMode>
            style={{ marginTop: space.xl }}
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
            <View style={styles.numbers}>
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
              <Text style={[type.text, styles.empty, { color: color.secondary }]}>
                Nothing is for sale yet. Open a slab and set it to Sell, or add slabs to the table from con mode.
              </Text>
            )}
            {table.forSale.length > SHOWN ? (
              <Text style={[type.text, styles.more, { color: color.secondary }]}>and {table.forSale.length - SHOWN} more</Text>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.numbers}>
              <Figure value={String(wished.length)} label="Wanted" />
              <Figure
                value={money(wished.reduce((t, w) => t + w.targetCents, 0))}
                label="Your targets"
              />
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
                      pay {money(w.targetCents)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[type.text, styles.empty, { color: color.secondary }]}>
                Your wishlist is empty. Search a card and add it with what you’d pay, or scan a dealer’s slab in con mode.
              </Text>
            )}
            <Pressable accessibilityRole="link" onPress={() => router.push('/search?con=1')} style={styles.quiet} hitSlop={8}>
              <Text style={[type.text, { color: color.ink }]}>Search a card to buy ›</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + space.s }]}>
        <PrimaryButton title={session ? 'Back to con mode' : 'Start con mode'} onPress={go} />
      </View>
    </View>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  const color = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: color.ink }]}>
        {value}
      </Text>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
    </View>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 3 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.conFill },
    numbers: { flexDirection: 'row', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.xxl, paddingBottom: space.xl },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m, rowGap: space.xl, paddingHorizontal: space.gutter },
    art: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    empty: { paddingHorizontal: space.gutter },
    more: { paddingHorizontal: space.gutter, paddingTop: space.l },
    quiet: { alignSelf: 'flex-start', paddingHorizontal: space.gutter, paddingTop: space.xl, minHeight: size.touch, justifyContent: 'center' },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: space.gutter,
      paddingTop: space.s,
      backgroundColor: color.canvas,
    },
  }),
);
