// Price a bundle: "how much for these three?" Pick cards off the table, then one ask and one floor
// for all of them (src/pricing/rules.ts bundle). The floor lets a card that's up carry one that's
// down, but with "never sell at a loss" on the lot as a whole never sells under what it cost. Type
// their offer for a verdict, the same as Offer; Sold marks every card sold, the total split by
// market (src/pricing/split.ts).

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../src/components/Keypad';
import { PriceLine, type Tick } from '../../src/components/PriceLine';
import { ConGrid } from '../../src/components/con/ConGrid';
import { SlabView } from '../../src/components/SlabView';
import { BackIcon, IconButton, PrimaryButton } from '../../src/components/ui';
import { money, rowTitle } from '../../src/lib/format';
import { inputsFor, rowFor, type CardRow } from '../../src/pricing/portfolio';
import { bundle, verdictAt } from '../../src/pricing/rules';
import { splitTotal } from '../../src/pricing/split';
import { DEFAULT_CON_NAME, useCon } from '../../src/store/con';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { color, size, space, type } from '../../src/theme/tokens';

const MAX_DIGITS = 7;

export default function Bundle() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cards = useVault((s) => s.cards);
  const update = useVault((s) => s.update);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const session = useCon((s) => s.session);
  const startCon = useCon((s) => s.start);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'pick' | 'price'>('pick');
  const [digits, setDigits] = useState('');
  const [counter, setCounter] = useState<number | null>(null);
  /** A sale at a loss waiting for its second tap: the price. */
  const [confirm, setConfirm] = useState<number | null>(null);
  const [sold, setSold] = useState<{ cards: CardRow['card'][]; shares: number[]; cents: number; paidCents: number } | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  // On the table: for sale or trade only, with a price to work from.
  const rows = useMemo(
    () =>
      cards
        .filter((c) => c.status === 'owned' && (c.plan === 'sell' || c.plan === 'trade'))
        .map((c) => rowFor(c, rules))
        .sort((a, b) => (b.price?.marketCents ?? 0) - (a.price?.marketCents ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, rules, prices],
  );
  const chosen = rows.filter((r) => picked.has(r.card.id) && r.price);
  const q = bundle(chosen.map((r) => inputsFor(r.card, r.price!, rules)));
  const unpriced = rows.filter((r) => picked.has(r.card.id) && !r.price).length;

  const toggle = (r: CardRow) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked((p) => {
      const n = new Set(p);
      n.has(r.card.id) ? n.delete(r.card.id) : n.add(r.card.id);
      return n;
    });
  };

  const back = () => {
    if (step === 'price' && !sold) {
      setStep('pick');
      setDigits('');
      setCounter(null);
      return;
    }
    router.back();
  };

  const nav = (title: string) => (
    <View style={styles.nav}>
      <IconButton label="Back" onPress={back}>
        <BackIcon />
      </IconButton>
      <Text style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>{title}</Text>
      <View style={{ width: size.touch }} />
    </View>
  );

  if (step === 'pick') {
    const n = chosen.length;
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        {nav('Price a bundle')}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}>
          <Text style={[type.text, { color: color.secondary, paddingBottom: space.xl }]}>
            Tap the cards they want together.
          </Text>
          {rows.length ? (
            <ConGrid rows={rows} width={width - space.gutter * 2} onPress={toggle} onLongPress={() => undefined} selected={picked} />
          ) : (
            <Text style={[type.text, { color: color.secondary }]}>Nothing is on the table yet. Mark cards for sale or trade first.</Text>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
          {n >= 2 ? (
            <PrimaryButton title={`Price ${n} cards · ask ${money(q.askCents)}`} onPress={() => setStep('price')} />
          ) : (
            <Text style={[type.text, styles.hint, { color: color.secondary }]}>
              {n === 1 ? `1 picked · ask ${money(q.askCents)} · pick one more` : unpriced ? 'Cards without comps can’t be priced yet' : 'Pick two or more cards'}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── The bundle's numbers and their offer ──
  const offer = (parseInt(digits || '0', 10) || 0) * 100;
  const hasOffer = digits.length > 0;
  const v = hasOffer ? verdictAt(offer, q.floorCents, q.askCents) : null;
  const awaiting = counter != null && !hasOffer;

  const clearConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirm(null);
  };
  const typeDigit = (d: string) => {
    if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
    clearConfirm();
    setDigits(digits + d);
  };
  const makeCounter = (cents: number) => {
    setCounter(cents);
    setDigits('');
    clearConfirm();
  };

  const sellAll = (cents: number) => {
    const loss = q.paidCents > 0 && cents < q.paidCents;
    if (loss && confirm !== cents) {
      setConfirm(cents);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    clearConfirm();
    let where = session?.name ?? null;
    if (!session) {
      startCon(DEFAULT_CON_NAME);
      where = DEFAULT_CON_NAME;
    }
    const shares = splitTotal(cents, chosen.map((r) => r.price?.marketCents ?? null));
    const at = new Date().toISOString();
    // Keep the cards as they were (for Undo) and what the lot cost: the rows drop off the table now.
    const before = chosen.map((r) => r.card);
    chosen.forEach((r, i) => update(r.card.id, { status: 'sold', soldCents: shares[i], soldAt: at, soldWhere: where }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSold({ cards: before, shares, cents, paidCents: q.paidCents });
  };

  const undo = () => {
    if (!sold) return;
    for (const c of sold.cards) update(c.id, { status: c.status, soldCents: c.soldCents, soldAt: c.soldAt, soldWhere: c.soldWhere });
    setSold(null);
  };

  if (sold) {
    const profit = sold.paidCents ? sold.cents - sold.paidCents : null;
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        {nav('Bundle sold')}
        <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'center', alignItems: 'center', gap: space.s }}>
          <View style={styles.thumbs}>
            {sold.cards.map((c, i) => (
              <View key={c.id} style={{ width: 72, alignItems: 'center', gap: 2 }}>
                <SlabView card={c} width={72} posed={false} />
                <Text style={[type.secondary, { color: color.ink, paddingTop: space.xs }]}>{money(sold.shares[i])}</Text>
              </View>
            ))}
          </View>
          <Text style={[type.text, { color: color.secondary, paddingTop: space.l }]}>Sold {sold.cards.length} cards for</Text>
          <Text style={[type.displayL, { color: color.ink }]}>{money(sold.cents)}</Text>
          {profit != null ? (
            <Text style={[type.body, { color: color.ink }]}>
              <Text style={{ color: profit >= 0 ? color.gain : color.loss }}>
                {profit >= 0 ? '+' : '−'}
                {money(Math.abs(profit))}
              </Text>{' '}
              on {money(sold.paidCents)} paid
            </Text>
          ) : null}
          <Text style={[type.secondary, { color: color.secondary }]}>Each card’s sale price is its share by market.</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.l, gap: space.s }]}>
          <PrimaryButton title="Back to con mode" onPress={() => router.dismissTo({ pathname: '/con', params: { tab: 'sold', at: String(Date.now()) } })} />
          <Pressable accessibilityRole="button" onPress={undo} style={styles.quiet}>
            <Text style={[type.body, { color: color.ink }]}>Undo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  let verdictNode: React.ReactNode = null;
  if (awaiting) verdictNode = <Text style={{ color: color.secondary }}>Type their answer</Text>;
  else if (v) {
    const amt = money(Math.abs(v.delta));
    verdictNode =
      v.kind === 'take' ? (
        <Text style={{ color: color.gain }}>{v.delta === 0 ? 'At your floor' : `${amt} over floor`}</Text>
      ) : (
        <Text style={{ color: v.kind === 'counter' ? color.conText : color.loss }}>{amt} under floor</Text>
      );
  }

  let primary: { title: string; onPress: () => void } | null = null;
  let quiet: { title: string; onPress: () => void } | null = null;
  if (awaiting) primary = { title: `Sold for ${money(counter!)}`, onPress: () => sellAll(counter!) };
  else if (v) {
    if (v.kind === 'take') primary = { title: `Sold for ${money(offer)}`, onPress: () => sellAll(offer) };
    else if (v.kind === 'counter') {
      primary = { title: `Counter ${money(v.counterAt)}`, onPress: () => makeCounter(v.counterAt) };
      quiet = { title: `Take ${money(offer)} anyway`, onPress: () => sellAll(offer) };
    } else {
      primary = { title: 'Walk away', onPress: () => router.back() };
      quiet = { title: `Counter ${money(v.counterAt)}`, onPress: () => makeCounter(v.counterAt) };
    }
  }
  // Small slabs, about four across; more scroll sideways at the same size.
  const slabW = Math.min(80, Math.floor((width - space.gutter * 2 - space.l * 3) / 4));

  const ticks: Tick[] = [];
  if (q.paidCents) ticks.push({ value: q.paidCents, label: 'Paid', color: color.ink });
  ticks.push({ value: q.floorCents, label: 'Floor', color: color.loss, labelColor: color.loss, height: 14 });
  ticks.push({ value: q.marketCents, label: 'Market', color: color.secondary });

  const quietText = confirm != null ? `Tap again to sell at a ${money(q.paidCents - confirm)} loss` : quiet?.title;
  const quietPress = confirm != null ? () => sellAll(confirm) : quiet?.onPress;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      {nav('Bundle')}
      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ gap: space.m }}>
          {/* The cards themselves, each with its market price: what the total is made of. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slabs}>
            {chosen.map((r) => (
              <View key={r.card.id} style={{ width: slabW, gap: 2 }}>
                <View style={{ alignItems: 'center', paddingBottom: space.s }}>
                  <SlabView card={r.card} width={slabW} posed={false} />
                </View>
                <Text style={[type.numberM, { color: color.ink }]}>{r.price ? money(r.price.marketCents) : '—'}</Text>
                <Text style={[type.secondary, { color: color.secondary }]}>{rowTitle(r.card)}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={[type.secondary, { color: color.secondary }]}>
            Ask {money(q.askCents)} for all {q.count}
            {q.floorBasis === 'paid' ? ' · floor is what they cost you' : q.floorBasis === 'ask' ? ' · floor is the ask' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>{awaiting ? 'You countered' : 'Their offer'}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: hasOffer || awaiting ? color.ink : color.hairline }]}>
            {money(awaiting ? counter! : offer)}
          </Text>
          <Text style={[type.section, { minHeight: 26 }]}>{verdictNode}</Text>
        </View>
        <PriceLine
          ticks={ticks}
          fill={(hasOffer || awaiting) && q.paidCents ? { from: q.paidCents, to: awaiting ? counter! : offer, color: color.conFill } : undefined}
          dot={hasOffer || awaiting ? { value: awaiting ? counter! : offer, color: color.conFill } : undefined}
        />
        {primary ? (
          <View style={{ gap: space.s }}>
            <PrimaryButton title={primary.title} onPress={primary.onPress} />
            <Pressable accessibilityRole="button" disabled={!quietText} onPress={quietPress} style={styles.quiet}>
              <Text style={[type.body, { color: color.ink }]}>{quietText ?? ''}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ height: size.button + size.touch + space.s }} />
        )}
      </View>
      <Keypad
        bottomInset={insets.bottom}
        onDigit={typeDigit}
        onBackspace={() => {
          clearConfirm();
          setDigits(digits.slice(0, -1));
        }}
        onClear={() => {
          clearConfirm();
          setCounter(null);
          setDigits('');
        }}
      />
    </View>
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
  hint: { textAlign: 'center', minHeight: size.button, textAlignVertical: 'center', paddingTop: space.l },
  slabs: { gap: space.l, paddingRight: space.gutter },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.s },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
