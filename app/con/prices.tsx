// Con mode → Selling → price list: every card for sale with its price, at a glance. Totals on top
// (ask, market, floors) with Edit total; one row per card with its slab, name, grade and market, the
// ask in bold and the floor under it. Tap a row to change that card's ask (or its floor, one tab over);
// Edit total spreads a new total across the cards, floors holding (src/pricing/priceList.ts). Both
// edits are sheets, so the list stays put, and the last one can be undone.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SlabView } from '../../src/components/SlabView';
import { openCardPriceSheet, openTotalSheet, restorePrices, type PriceSnapshot } from '../../src/components/con/priceSheets';
import { BackIcon, Hairline, IconButton } from '../../src/components/ui';
import { cardPrice, gradeLabel, money, pct, rowTitle, rulePct } from '../../src/lib/format';
import { rowFor, type CardRow } from '../../src/pricing/portfolio';
import { priceList } from '../../src/pricing/priceList';
import { LAST_DAY_CUT_PCT, lastDayActive } from '../../src/pricing/rules';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

const SLAB_W = 40;

export default function PriceList() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => priceList(cards.map((c) => rowFor(c, rules))), [cards, rules, prices]);
  const [undo, setUndo] = useState<{ before: PriceSnapshot; what: string } | null>(null);
  const saved = (before: PriceSnapshot, what: string) => setUndo({ before, what });
  const count = list.items.length + list.unpriced.length;
  const vsMarket = list.marketCents ? list.askCents / list.marketCents - 1 : 0;
  const lastDay = lastDayActive(rules);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>Price list</Text>
        <View style={{ width: size.touch }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.totals}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.displayS, { color: color.ink }]}>{money(list.askCents)}</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>
              asking · {count} {count === 1 ? 'card' : 'cards'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[type.numberM, { color: color.ink }]}>{money(list.marketCents)}</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>market</Text>
          </View>
        </View>
        <View style={styles.subTotals}>
          <Text style={[type.secondary, { color: color.secondary, flex: 1 }]}>
            Floors <Text style={{ color: color.ink, fontWeight: '600' }}>{money(list.floorCents)}</Text>
            {list.marketCents ? ` · ask ${pct(vsMarket)} vs market` : ''}
          </Text>
          {list.items.length ? (
            <Pressable accessibilityRole="button" onPress={() => openTotalSheet(saved)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}>
              <Text style={[type.secondary, { color: color.ink, fontWeight: '600' }]}>Edit total</Text>
            </Pressable>
          ) : null}
        </View>

        {/* One slot for the last change's Undo, or last-day prices while they're on. */}
        <View style={styles.slot}>
          {undo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Puts the prices back"
              onPress={() => {
                restorePrices(undo.before);
                setUndo(null);
              }}
              style={styles.undo}
            >
              <Text numberOfLines={1} style={[type.secondary, { color: color.secondary, flexShrink: 1 }]}>
                {undo.what} saved
              </Text>
              <Text style={[type.secondary, { color: color.ink, fontWeight: '600' }]}>Undo</Text>
            </Pressable>
          ) : lastDay ? (
            <View style={styles.undo}>
              <View style={styles.dot} />
              <Text style={[type.secondary, { color: color.conText, fontWeight: '500' }]}>
                Last-day prices · floors {rulePct(-(rules.lastDayCutPct ?? LAST_DAY_CUT_PCT))} until midnight
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.list}>
          {list.items.map((it) => (
            <View key={it.row.card.id}>
              <PriceRow row={it.row} onPress={() => openCardPriceSheet(it.row.card, saved)} />
              <Hairline inset={SLAB_W + space.m} />
            </View>
          ))}
          {list.unpriced.map((r) => (
            <View key={r.card.id}>
              <PriceRow row={r} />
              <Hairline inset={SLAB_W + space.m} />
            </View>
          ))}
          {count === 0 ? (
            <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
              No cards marked for sale. Put some on the table from con mode.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** Slab, name (never cut), grade and market; the ask in bold with the floor under it. */
function PriceRow({ row, onPress }: { row: CardRow; onPress?: () => void }) {
  const color = useColors();
  const styles = useStyles();
  const { card, price } = row;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.ask != null ? `${rowTitle(card)}, asking ${money(row.ask)}, floor ${money(row.floor ?? 0)}` : rowTitle(card)}
      accessibilityHint={onPress ? 'Change the price' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <SlabView card={card} width={SLAB_W} posed={false} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>{rowTitle(card)}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>
          {gradeLabel(card.grader, card.grade, card.condition)}
          {price ? ` · market ${cardPrice(price.marketCents)}` : ''}
        </Text>
      </View>
      <View style={styles.price}>
        <Text style={[type.numberM, { color: row.ask != null ? color.ink : color.secondary }]}>{row.ask != null ? cardPrice(row.ask) : '—'}</Text>
        {row.floor != null ? (
          <Text style={[type.secondary, { color: color.secondary }]}>floor {cardPrice(row.floor)}</Text>
        ) : (
          <Text style={[type.secondary, { color: color.secondary }]}>no comps yet</Text>
        )}
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: color.canvas },
    nav: { height: size.touch + space.l, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter - 12 },
    totals: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.gutter, paddingTop: space.m },
    subTotals: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.gutter, paddingTop: space.s },
    pill: { height: 32, paddingHorizontal: 14, borderRadius: radius.button, backgroundColor: color.well, alignItems: 'center', justifyContent: 'center' },
    slot: { minHeight: 32, justifyContent: 'center', paddingHorizontal: space.gutter, marginTop: space.xs },
    undo: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 32 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.conFill },
    list: { paddingHorizontal: space.gutter },
    row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    price: { alignItems: 'flex-end', gap: 2, minWidth: 84 },
  }),
);
