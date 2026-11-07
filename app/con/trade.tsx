// Trade calculator: your cards on one side, theirs on the other, market value for each side and
// which way it leans (src/pricing/rules.ts trade: within 5% is even). Yours come from the vault;
// theirs from card search at a grade (search ?trade=1 → card page "Add to their side"). The trade
// stays on the phone until Clear (src/store/trade.ts). Nothing here changes your vault.

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { CardThumb } from '../../src/components/CardThumb';
import { ConGrid } from '../../src/components/con/ConGrid';
import { BackIcon, Hairline, IconButton, PlusIcon, PrimaryButton } from '../../src/components/ui';
import { cardLabel, money, rowTitle } from '../../src/lib/format';
import { rowFor, type CardRow } from '../../src/pricing/portfolio';
import { TRADE_LABEL, trade } from '../../src/pricing/rules';
import { gradeLabel, type SearchGrade } from '../../src/services/search';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useTrade, type TheirCard } from '../../src/store/trade';
import { useVault } from '../../src/store/vault';
import { color, size, space, type } from '../../src/theme/tokens';

export default function Trade() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const { mine, theirs, toggleMine, removeTheirs, clear } = useTrade();
  const [picking, setPicking] = useState(false);

  // Your side can be anything you own; trade-only cards first, then for sale, then holds.
  const owned = useMemo(() => {
    const order = { trade: 0, sell: 1, hold: 2 } as const;
    return cards
      .filter((c) => c.status === 'owned')
      .map((c) => rowFor(c, rules))
      .sort((a, b) => order[a.card.plan] - order[b.card.plan] || (b.price?.marketCents ?? 0) - (a.price?.marketCents ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, rules, prices]);
  const mineRows = mine.map((id) => owned.find((r) => r.card.id === id)).filter((r): r is CardRow => !!r);
  const t = trade(
    mineRows.map((r) => r.price?.marketCents ?? 0),
    theirs.map((c) => c.marketCents),
  );
  const unpriced = mineRows.filter((r) => !r.price).length;
  const empty = !mineRows.length && !theirs.length;

  const nav = (title: string, onBack: () => void, right?: React.ReactNode) => (
    <View style={styles.nav}>
      <IconButton label="Back" onPress={onBack}>
        <BackIcon />
      </IconButton>
      <Text style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>{title}</Text>
      <View style={{ width: size.touch, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );

  if (picking) {
    const picked = new Set(mine);
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        {nav('Your cards', () => setPicking(false))}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}>
          <Text style={[type.text, { color: color.secondary, paddingBottom: space.xl }]}>Tap the cards you’d give.</Text>
          <ConGrid
            rows={owned}
            width={width - space.gutter * 2}
            selected={picked}
            onLongPress={() => undefined}
            onPress={(r) => {
              Haptics.selectionAsync().catch(() => {});
              toggleMine(r.card.id);
            }}
          />
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
          <PrimaryButton title={mine.length ? `Done · ${mine.length} picked` : 'Done'} onPress={() => setPicking(false)} />
        </View>
      </View>
    );
  }

  const gapTint = t.kind === 'even' ? color.ink : t.gapCents > 0 ? color.gain : color.loss;
  const sign = t.gapCents > 0 ? '+' : t.gapCents < 0 ? '−' : '';

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      {nav(
        'Trade',
        () => router.back(),
        empty ? null : (
          <Pressable accessibilityRole="button" onPress={clear} hitSlop={8} style={{ minHeight: size.touch, justifyContent: 'center', paddingRight: 12 }}>
            <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>Clear</Text>
          </Pressable>
        ),
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.sides}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.secondary, { color: color.secondary }]}>You give</Text>
            <Text style={[type.displayS, { color: color.ink }]}>{money(t.mineCents)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
            <Text style={[type.secondary, { color: color.secondary }]}>You get</Text>
            <Text style={[type.displayS, { color: color.ink }]}>{money(t.theirsCents)}</Text>
          </View>
        </View>
        <View style={styles.verdict}>
          {empty ? (
            <Text style={[type.text, { color: color.secondary }]}>Add cards to both sides to see who comes out ahead.</Text>
          ) : (
            <>
              <Text style={[type.section, { color: color.ink }]}>{TRADE_LABEL[t.kind]}</Text>
              <Text style={[type.body, { color: color.secondary }]}>
                <Text style={{ color: gapTint }}>
                  {sign}
                  {money(Math.abs(t.gapCents))} ({sign}
                  {Math.round(Math.abs(t.gapPct) * 100)}%)
                </Text>{' '}
                to you, at market
              </Text>
              {unpriced ? (
                <Text style={[type.secondary, { color: color.secondary }]}>
                  {unpriced === 1 ? 'One of your cards has' : `${unpriced} of your cards have`} no comps yet and count as $0.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <Side title="Yours" total={t.mineCents} addLabel={mineRows.length ? 'Change your cards' : 'Add from your vault'} onAdd={() => setPicking(true)}>
          {mineRows.map((r, i) => (
            <View key={r.card.id}>
              {i ? <Hairline inset={size.thumbW + space.m} /> : null}
              <Pressable accessibilityRole="button" accessibilityHint="Takes it off your side" onPress={() => toggleMine(r.card.id)} style={styles.row}>
                <CardThumb card={r.card} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: color.ink }]}>{rowTitle(r.card)}</Text>
                  <Text style={[type.secondary, { color: color.secondary }]}>{cardLabel(r.card)}</Text>
                </View>
                <Text style={[type.numberM, { color: color.ink }]}>{r.price ? money(r.price.marketCents) : '—'}</Text>
              </Pressable>
            </View>
          ))}
        </Side>

        <Side title="Theirs" total={t.theirsCents} addLabel="Search their card" onAdd={() => router.push('/search?trade=1')}>
          {theirs.map((c, i) => (
            <View key={c.key}>
              {i ? <Hairline inset={size.thumbW + space.m} /> : null}
              <TheirRow c={c} onRemove={() => removeTheirs(c.key)} />
            </View>
          ))}
        </Side>
        <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xl }]}>
          Tap a card to take it off. Values are market for each card’s grade, the same numbers as the rest of Slabby.
        </Text>
      </ScrollView>
    </View>
  );
}

function Side({ title, total, addLabel, onAdd, children }: { title: string; total: number; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <View style={{ paddingTop: space.xxl }}>
      <View style={styles.sideHead}>
        <Text style={[type.section, { color: color.ink }]}>{title}</Text>
        <Text style={[type.numberM, { color: color.secondary }]}>{money(total)}</Text>
      </View>
      <Hairline />
      {children}
      {Array.isArray(children) && children.length ? <Hairline inset={size.thumbW + space.m} /> : null}
      <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}>
        <PlusIcon s={20} />
        <Text style={[type.body, { color: color.ink }]}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

function TheirRow({ c, onRemove }: { c: TheirCard; onRemove: () => void }) {
  const detail = [c.setName, gradeLabel(c.grade as SearchGrade | 'raw')].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Takes it off their side" onPress={onRemove} style={styles.row}>
      <View style={styles.art}>{c.imageUrl ? <ArtImage uri={c.imageUrl} recyclingKey={c.key} style={{ flex: 1 }} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: color.ink }]}>{c.name}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>{detail}</Text>
      </View>
      <Text style={[type.numberM, { color: color.ink }]}>{money(c.marketCents)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter - 12,
  },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.s },
  sides: { flexDirection: 'row', gap: space.l, paddingTop: space.l },
  verdict: { paddingTop: space.l, gap: space.xs },
  sideHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: size.rowVault, paddingVertical: space.s },
  art: { width: size.thumbW, height: size.thumbH, borderRadius: 3, overflow: 'hidden', backgroundColor: color.well },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: size.touch + space.s },
});
