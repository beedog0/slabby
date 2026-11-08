// Price check: the scan sheet's bottom half when you're comping someone else's card, not adding
// your own. Quick information first: the grade ladder (Raw · PSA 10 · 9 · 8, the scanned grade in
// ink), how many sales the price rests on, then "They're asking" with a live Steal / Good buy /
// Fair / Over market rating against your buying rules. One primary action per rating, like the
// They're asking page (app/con/buy/[id].tsx): Bought for, Counter, Walk away. Adding to the vault
// without buying stays a quiet line at the bottom. Colors are only read in render (never in the
// StyleSheet), so dark mode's useColors() drops in with one line.

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cardPrice, money } from '../../lib/format';
import { priceConfidence } from '../../pricing/confidence';
import { BUY_RATING_LABEL, SUSPICIOUS_FRACTION, buyRating, looksLikeTypo } from '../../pricing/rules';
import { buyPrices, gradeLabel, openPrices, TOP_GRADES, type SearchGrade, type SearchPrices } from '../../services/search';
import type { CardPrice } from '../../services/comps';
import { useRules } from '../../store/rules';
import { size, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { KEYBOARD_DONE } from '../KeyboardDone';
import { Hairline, PrimaryButton } from '../ui';

export type CheckGrade = SearchGrade | 'raw';

type Props = {
  /** The catalog card, for the grade ladder. Null: no ladder, the sheet's own price is used. */
  productId: number | null;
  /** The grade in hand. Null for a slab we can't map to a PSA grade (BGS/CGC half grades). */
  grade: CheckGrade | null;
  /** The price the sheet already has for this card (vault comps for a slab, TCGplayer for raw). */
  fallback: CardPrice | null;
  /** Bought at this price: the scan screen saves the card and gets ready for the next one. */
  onBought: (cents: number, marketCents: number | null) => void;
  /** Done with this card without buying. */
  onNext: () => void;
  /** Quiet: add it to the vault the normal way (your own card after all). */
  onAdd: () => void;
};

const MAX_DIGITS = 6;

/** Raw, PSA 10, 9, 8; a lower scanned grade takes PSA 8's place so it's always on the ladder. */
export function ladderGrades(grade: CheckGrade | null): CheckGrade[] {
  const top: CheckGrade[] = ['raw', ...TOP_GRADES];
  if (!grade || top.includes(grade)) return top;
  return ['raw', 'psa10', 'psa9', grade];
}

export function PriceCheck({ productId, grade, fallback, onBought, onNext, onAdd }: Props) {
  const color = useColors();
  const rules = useRules((s) => s.rules);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(productId ? undefined : null);
  const [digits, setDigits] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!productId) return setPrices(null);
    let live = true;
    setPrices(undefined);
    openPrices(productId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    return () => {
      live = false;
    };
  }, [productId]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // The grade in hand shows the sheet's own price, so the ladder and the big number agree (and a
  // raw card keeps the price of the print picked); the other grades come from the catalog.
  const priceAt = (g: CheckGrade): CardPrice | null =>
    (g === grade ? fallback : null) ?? (g === 'raw' ? prices?.raw : prices?.grades[g]) ?? null;
  const price = grade ? priceAt(grade) : fallback;
  const market = price?.marketCents ?? null;
  const conf = priceConfidence(price, { raw: grade === 'raw' });
  const buy = buyPrices(market, rules);
  const ask = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;
  const typo = has && market != null && looksLikeTypo(ask, market);
  const rating = buy && market && has && !typo ? buyRating(ask, { targetCents: buy.target, maxCents: buy.max, marketCents: market }) : null;

  const prev = useRef(0);
  const setAsk = (next: string) => {
    const clean = next.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
    const cents = (parseInt(clean || '0', 10) || 0) * 100;
    // A tick as the price crosses your target or max, the same as the They're asking page.
    const crossed = (line: number | undefined) => line != null && prev.current <= line !== cents <= line;
    if (crossed(buy?.target)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else if (crossed(buy?.max)) Haptics.selectionAsync().catch(() => {});
    prev.current = cents;
    if (timer.current) clearTimeout(timer.current);
    setConfirm(null);
    setDigits(clean);
  };

  /** Over your max, or far under market (fakes, swapped labels), takes a second tap. */
  const buyAt = (cents: number, alwaysConfirm = false) => {
    const tooGood = market != null && cents < market * SUSPICIOUS_FRACTION;
    if ((alwaysConfirm || tooGood) && !confirm) {
      setConfirm(tooGood ? `Under half of market. Tap again to pay ${money(cents)}` : `Tap again to pay ${money(cents)}`);
      timer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    setConfirm(null);
    onBought(cents, market);
  };

  let primary: { title: string; onPress: () => void } | null = null;
  let quiet: { title: string; onPress: () => void } = { title: 'Add to vault instead', onPress: onAdd };
  if (rating) {
    if (rating.kind === 'steal' || rating.kind === 'good') {
      primary = { title: `Bought for ${money(ask)}`, onPress: () => buyAt(ask) };
      if (confirm) quiet = { title: confirm, onPress: () => buyAt(ask) };
    } else if (rating.kind === 'fair') {
      primary = { title: `Counter ${money(rating.counterAt)}`, onPress: () => setAsk(String(rating.counterAt / 100)) };
      quiet = { title: confirm ?? `Buy at ${money(ask)} anyway`, onPress: () => buyAt(ask, true) };
    } else {
      primary = { title: 'Walk away', onPress: onNext };
      quiet = { title: `Counter ${money(rating.counterAt)}`, onPress: () => setAsk(String(rating.counterAt / 100)) };
    }
  }

  // The rating: the word, then why, with color only on the number.
  let word: string | null = null;
  let why: React.ReactNode = null;
  if (typo && market) {
    word = 'Check the number';
    why = `That's ${Math.round(ask / market)}× market`;
  } else if (rating) {
    word = BUY_RATING_LABEL[rating.kind];
    const d = money(Math.abs(rating.deltaToMax));
    why =
      rating.kind === 'over' ? (
        <>
          <Text style={{ color: color.loss }}>{money(rating.deltaToMarket)}</Text> over
        </>
      ) : rating.kind === 'fair' ? (
        <>
          <Text style={{ color: color.conText }}>{d}</Text> over your max
        </>
      ) : rating.deltaToMax === 0 ? (
        'At your max'
      ) : (
        <>
          <Text style={{ color: color.gain }}>{d}</Text> under your max
        </>
      );
  }

  const rungs = ladderGrades(grade);

  return (
    <View>
      <View style={styles.ladder} accessibilityLabel="Prices by grade">
        {rungs.map((g) => {
          const p = priceAt(g);
          const mine = g === grade;
          return (
            <View key={g} style={styles.rung}>
              <Text numberOfLines={1} style={[type.secondary, { color: mine ? color.ink : color.secondary }]}>
                {gradeLabel(g)}
              </Text>
              <Text numberOfLines={1} style={[type.rowPrice, { color: mine ? color.ink : color.secondary, fontWeight: mine ? '600' : '400' }]}>
                {p ? cardPrice(p.marketCents) : prices === undefined ? ' ' : '—'}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.m }]}>
        {prices === undefined && !price ? 'Loading prices' : conf.line}
      </Text>
      <Hairline />
      <View style={styles.field}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flexShrink: 0 }]}>
          They're asking
        </Text>
        <TextInput
          value={digits ? `$${digits}` : ''}
          onChangeText={setAsk}
          placeholder="$0"
          placeholderTextColor={color.secondary}
          keyboardType="number-pad"
          inputAccessoryViewID={KEYBOARD_DONE}
          style={[type.rowPrice, styles.input, { color: color.ink }]}
          accessibilityLabel="They're asking"
        />
      </View>
      <Hairline />
      <View style={styles.verdict}>
        {word ? (
          <Text style={[type.text, { color: color.secondary }]}>
            <Text style={{ color: color.ink, fontWeight: '600' }}>{word}</Text>
            {why ? ' · ' : ''}
            {why}
            {rating && !rating.suspicious ? ` · ${Math.round(rating.pctOfMarket * 100)}% of market` : ''}
            {rating?.suspicious ? ' · check the slab' : ''}
          </Text>
        ) : (
          <Text style={[type.text, { color: color.secondary }]}>
            {buy && market ? `Open ${money(buy.target)} · pay up to ${money(buy.max)}` : market ? 'Set your buying rules in Pricing rules' : 'No market price to rate against'}
          </Text>
        )}
      </View>
      {primary ? <PrimaryButton title={primary.title} onPress={primary.onPress} /> : <PrimaryButton title="Scan next" onPress={onNext} />}
      <Pressable accessibilityRole="button" onPress={quiet.onPress} style={styles.quiet}>
        <Text style={[type.body, { color: color.ink }]}>{quiet.title}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ladder: { flexDirection: 'row', paddingBottom: space.s },
  rung: { flex: 1, gap: 2 },
  field: { minHeight: size.touch + space.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Same as the scan sheet's Paid and Sold for fields.
  input: { width: 140, textAlign: 'right', paddingVertical: space.s },
  verdict: { minHeight: size.touch, justifyContent: 'center', paddingVertical: space.s },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
