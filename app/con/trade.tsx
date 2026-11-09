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
import { choiceFor, sameCard } from '../../src/services/cardLink';
import { gradeLabel, nameAndVariant, type SearchGrade } from '../../src/services/search';
import { setTitle } from '../../src/components/search/CardAnalytics';
import { openMenu } from '../../src/components/menu/Menu';
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
  // One price per card and grade: when their card is one you also own at that grade, it's valued
  // at your vault price (what your side uses), not the search snapshot taken when it was added.
  const theirValue = (c: TheirCard) => {
    const same =
      c.setCode !== undefined &&
      owned.find(
        (r) =>
          r.price &&
          (r.card.grader === 'psa' || r.card.grader === 'raw') &&
          choiceFor(r.card) === c.grade &&
          sameCard({ number: c.number ?? '', setCode: c.setCode ?? null, language: c.language }, r.card),
      );
    return same ? same.price!.marketCents : c.marketCents;
  };
  const t = trade(
    mineRows.map((r) => r.price?.marketCents ?? 0),
    theirs.map(theirValue),
  );
  const unpriced = mineRows.filter((r) => !r.price).length;
  const empty = !mineRows.length && !theirs.length;
  // A verdict needs something on both sides; one side alone isn't a trade yet.
  const both = mineRows.length > 0 && theirs.length > 0;

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
            market
            onLongPress={() => undefined}
            onPress={(r) => {
              Haptics.selectionAsync().catch(() => {});
              toggleMine(r.card.id);
            }}
          />
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
          <PrimaryButton title={mineRows.length ? `Done · ${mineRows.length} picked` : 'Done'} onPress={() => setPicking(false)} />
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
          {!both ? (
            <Text style={[type.text, { color: color.secondary }]}>
              {empty ? 'Add cards to both sides to see who comes out ahead.' : mineRows.length ? 'Now add what they’re offering.' : 'Now add what you’d give.'}
            </Text>
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

        <Side title="Yours" addLabel={mineRows.length ? 'Change your cards' : 'Add from your vault'} onAdd={() => setPicking(true)}>
          {mineRows.map((r, i) => (
            <View key={r.card.id}>
              {i ? <Hairline inset={size.thumbW + space.m} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openMenu({ card: r.card, items: [{ label: 'Take off the trade', onPress: () => toggleMine(r.card.id) }] })}
                style={styles.row}
              >
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

        <Side title="Theirs" addLabel="Search their card" onAdd={() => router.push('/search?trade=1')}>
          {theirs.map((c, i) => (
            <View key={c.key}>
              {i ? <Hairline inset={size.thumbW + space.m} /> : null}
              <TheirRow
                c={c}
                value={theirValue(c)}
                onPress={() => openMenu({ title: c.name, items: [{ label: 'Take off the trade', onPress: () => removeTheirs(c.key) }] })}
              />
            </View>
          ))}
        </Side>
        <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xl }]}>Values are market for each card’s grade.</Text>
      </ScrollView>
    </View>
  );
}

function Side({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <View style={{ paddingTop: space.xxl }}>
      <View style={styles.sideHead}>
        <Text style={[type.section, { color: color.ink }]}>{title}</Text>
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

function TheirRow({ c, value, onPress }: { c: TheirCard; value: number; onPress: () => void }) {
  // Name on one line; variant, set (without its "SWSH07:" code) and grade on the next.
  const { name, variant } = nameAndVariant(c.name);
  const detail = [variant, setTitle(c.setName), gradeLabel(c.grade as SearchGrade | 'raw')].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.art}>{c.imageUrl ? <ArtImage uri={c.imageUrl} recyclingKey={c.key} style={{ flex: 1 }} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: color.ink }]}>{name}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>{detail}</Text>
      </View>
      <Text style={[type.numberM, { color: color.ink }]}>{money(value)}</Text>
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
