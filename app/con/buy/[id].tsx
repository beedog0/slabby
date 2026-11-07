// Buying: "They're asking". Type the seller's price and Slabby rates it against your buying rules
// and the market for the grade you picked: Steal, Good buy, Fair or Over market, on a price line
// with Target, Max and Market. One action per rating, like Offer: Bought for, Counter, Walk away.
// "Bought for" adds the card to the vault with what you paid, then shows Bought with Undo.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../../src/components/Keypad';
import { PriceLine, type Tick } from '../../../src/components/PriceLine';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../../src/components/ui';
import { money } from '../../../src/lib/format';
import { BUY_RATING_LABEL, SUSPICIOUS_FRACTION, buyRating, looksLikeTypo } from '../../../src/pricing/rules';
import { matchNewCard, refreshPrices } from '../../../src/services/comps';
import { cardFromDetails } from '../../../src/services/psa';
import {
  addParams,
  buyPrices,
  catalogCard,
  gradeLabel,
  openPrices,
  type CatalogCard,
  type SearchGrade,
  type SearchPrices,
} from '../../../src/services/search';
import { useCon } from '../../../src/store/con';
import { useWishlist, wishKey, type WishGrade } from '../../../src/store/wishlist';
import { useRules } from '../../../src/store/rules';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

const MAX_DIGITS = 6;

export default function TheyreAsking() {
  const { id, grade: gradeParam } = useLocalSearchParams<{ id: string; grade?: string }>();
  const grade = (gradeParam || 'psa10') as SearchGrade | 'raw';
  const insets = useSafeAreaInsets();
  const rules = useRules((s) => s.rules);
  const add = useVault((s) => s.add);
  const conId = useCon((s) => s.session?.id);
  const wish = useWishlist((s) => s.items.find((i) => i.key === wishKey(Number(id), grade as WishGrade)));
  const seeMarket = useWishlist((s) => s.seeMarket);
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  const [digits, setDigits] = useState('');
  const [counter, setCounter] = useState<number | null>(null);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [bought, setBought] = useState<{ id: string; cents: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef(0);

  useEffect(() => {
    let live = true;
    const productId = Number(id);
    catalogCard(productId)
      .then((c) => live && setCard(c))
      .catch(() => {});
    openPrices(productId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const price = prices === undefined ? undefined : grade === 'raw' ? prices?.raw : prices?.grades[grade];
  // A wishlist card keeps the latest market it was seen at, so the wishlist rating stays current.
  useEffect(() => {
    if (wish && price) seeMarket(wish.key, price.marketCents, price.asOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price?.marketCents, wish?.key]);
  const market = price?.marketCents ?? null;
  const buy = buyPrices(market, rules);
  const ask = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;
  const rating =
    buy && market && has ? buyRating(ask, { targetCents: buy.target, maxCents: buy.max, marketCents: market }) : null;
  const typo = has && market != null && looksLikeTypo(ask, market);
  const title = card ? card.name.replace(/\s+-\s+[\w/-]*\d[\w/-]*$/, '') : '';

  const clearConfirm = () => {
    if (timer.current) clearTimeout(timer.current);
    setConfirm(null);
  };

  const setAsk = (next: string) => {
    const cents = (parseInt(next || '0', 10) || 0) * 100;
    const crossed = (line: number | undefined) => line != null && prev.current <= line !== cents <= line;
    if (crossed(buy?.target)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else if (crossed(buy?.max)) Haptics.selectionAsync().catch(() => {});
    prev.current = cents;
    clearConfirm();
    setDigits(next);
  };

  const key = (d: string) => {
    if (awaitingAnswer) {
      setAwaitingAnswer(false);
      setAsk(d === '0' ? '' : d);
      return;
    }
    if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
    setAsk(digits + d);
  };

  const makeCounter = (cents: number) => {
    setCounter(cents);
    setAsk(String(cents / 100));
    setAwaitingAnswer(true);
  };

  /** Add the card to the vault at this price. Over your max, a likely typo, or a too-good price takes a second tap. */
  const buyAt = (cents: number, alwaysConfirm = false) => {
    if (!card) return;
    const tooGood = market != null && cents < market * SUSPICIOUS_FRACTION;
    if ((alwaysConfirm || typo || tooGood) && !confirm) {
      setConfirm(tooGood ? `Under half of market. Tap again to pay ${money(cents)}` : `Tap again to pay ${money(cents)}`);
      timer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    clearConfirm();
    const p = addParams(card, grade);
    const c = cardFromDetails({
      cert: null,
      grader: grade === 'raw' ? 'raw' : 'psa',
      grade: grade === 'raw' ? 0 : Number(p.grade),
      name: p.name,
      setName: p.set,
      setCode: p.setCode || null,
      number: p.number,
      language: p.language === 'ja' ? 'ja' : 'en',
      paidCents: cents,
      plan: 'hold',
      imageFrontUrl: p.image || null,
      game: card.game,
    });
    const saved = { ...c, ...(grade === 'raw' ? { grade: null } : {}), boughtConId: conId, boughtMarketCents: market };
    add(saved);
    matchNewCard(saved, p.productId)
      .then(() => refreshPrices([saved]))
      .catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBought({ id: saved.id, cents });
  };

  const nav = (
    <View style={styles.nav}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon />
      </IconButton>
      <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>
        {title}
      </Text>
      <View style={{ width: size.touch }} />
    </View>
  );

  if (bought) {
    const under = market != null ? market - bought.cents : null;
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        {nav}
        <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'center', alignItems: 'center', gap: space.s }}>
          <Text style={[type.text, { color: color.secondary }]}>Bought for</Text>
          <Text style={[type.displayXL, { color: color.ink }]}>{money(bought.cents)}</Text>
          {under != null ? (
            <Text style={[type.section, { color: color.secondary }]}>
              <Text style={{ color: under >= 0 ? color.gain : color.loss }}>{money(Math.abs(under))}</Text>
              {under >= 0 ? ' under market' : ' over market'}
            </Text>
          ) : null}
          <Text style={[type.text, { color: color.secondary, textAlign: 'center', paddingTop: space.s }]}>
            In your vault as a hold. Add the cert from the card later.
          </Text>
        </View>
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.l, gap: space.s }}>
          <PrimaryButton
            title="Back to buying"
            onPress={() => router.dismissTo({ pathname: '/con', params: { flash: bought.id, at: String(Date.now()) } })}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // Undo: take the card back out of the vault.
              useVault.setState((s) => ({ cards: s.cards.filter((x) => x.id !== bought.id) }));
              setBought(null);
            }}
            style={styles.quiet}
          >
            <Text style={[type.body, { color: color.ink }]}>Undo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Rating: the number, the word, then the line that says why.
  let word = '';
  let why: React.ReactNode = null;
  if (awaitingAnswer) {
    word = 'Waiting on them';
    why = <Text style={{ color: color.secondary }}>Type their answer</Text>;
  } else if (typo && market) {
    word = 'Check the number';
    why = <Text style={{ color: color.secondary }}>That's {Math.round(ask / market)}× market</Text>;
  } else if (rating && buy) {
    word = BUY_RATING_LABEL[rating.kind];
    const d = money(Math.abs(rating.deltaToMax));
    why =
      rating.kind === 'over' ? (
        <Text style={{ color: color.secondary }}>
          <Text style={{ color: color.loss }}>{money(rating.deltaToMarket)}</Text> over market
        </Text>
      ) : rating.kind === 'fair' ? (
        <Text style={{ color: color.secondary }}>
          <Text style={{ color: color.conText }}>{d}</Text> over your max
        </Text>
      ) : rating.deltaToMax === 0 ? (
        <Text style={{ color: color.secondary }}>At your max</Text>
      ) : (
        <Text style={{ color: color.secondary }}>
          <Text style={{ color: color.gain }}>{d}</Text> under your max
        </Text>
      );
  }

  let primary: { title: string; onPress: () => void } | null = null;
  let quiet: { title: string; onPress: () => void } | null = null;
  if (awaitingAnswer && counter != null) {
    primary = { title: `Bought for ${money(counter)}`, onPress: () => buyAt(counter) };
  } else if (rating) {
    if (rating.kind === 'steal' || rating.kind === 'good') {
      primary = { title: `Bought for ${money(ask)}`, onPress: () => buyAt(ask) };
    } else if (rating.kind === 'fair') {
      primary = { title: `Counter ${money(rating.counterAt)}`, onPress: () => makeCounter(rating.counterAt) };
      quiet = { title: `Buy at ${money(ask)} anyway`, onPress: () => buyAt(ask, true) };
    } else {
      primary = { title: 'Walk away', onPress: () => router.back() };
      quiet =
        counter == null
          ? { title: `Counter ${money(rating.counterAt)}`, onPress: () => makeCounter(rating.counterAt) }
          : { title: `Buy at ${money(ask)} anyway`, onPress: () => buyAt(ask, true) };
    }
  }
  const quietText = confirm ?? quiet?.title;
  const quietPress = confirm ? (primary?.title.startsWith('Bought') ? primary.onPress : quiet?.onPress) : quiet?.onPress;

  const ticks: Tick[] = [];
  if (buy) {
    if (buy.target === buy.max)
      ticks.push({ value: buy.target, label: 'Target · Max', color: color.loss, labelColor: color.loss, height: 14 });
    else {
      ticks.push({ value: buy.target, label: 'Target', color: color.ink });
      ticks.push({ value: buy.max, label: 'Max', color: color.loss, labelColor: color.loss, height: 14 });
    }
  }
  if (market) ticks.push({ value: market, label: 'Market', color: color.secondary });

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      {nav}
      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>
            {awaitingAnswer ? 'You countered' : "They're asking"} · {gradeLabel(grade)}
          </Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: has ? color.ink : color.hairline }]}>
            {money(ask)}
          </Text>
          <Text style={[type.title, { color: color.ink, minHeight: 34 }]}>{has || awaitingAnswer ? word : ''}</Text>
          <Text style={[type.text, { minHeight: 20 }]}>{why}</Text>
          <Text style={[type.secondary, { color: color.secondary, minHeight: 18, paddingTop: 2 }]}>
            {counter != null && !awaitingAnswer
              ? `You said ${money(counter)}`
              : rating && !awaitingAnswer && !typo
                ? rating.suspicious
                  ? `${Math.round(rating.pctOfMarket * 100)}% of market. Check the slab`
                  : `${Math.round(rating.pctOfMarket * 100)}% of market`
                : prices === undefined
                  ? 'Loading prices…'
                  : !market
                    ? `No ${gradeLabel(grade)} market price yet`
                    : price?.sales30d
                      ? `${price.sales30d} ${price.sales30d === 1 ? 'sale' : 'sales'} in 30 days`
                      : ''}
          </Text>
        </View>

        {ticks.length && !typo ? (
          <PriceLine
            ticks={ticks}
            dot={has ? { value: ask, color: color.conFill } : undefined}
            fill={has && buy ? { from: Math.min(ask, buy.target), to: ask, color: color.conFill } : undefined}
          />
        ) : null}

        <View>
          <Hairline />
          <Text style={[type.text, { color: color.ink, paddingVertical: space.l }]}>
            {buy && market
              ? `Open ${money(buy.target)} · pay up to ${money(buy.max)} · market ${money(market)}`
              : 'Set your buying rules in Pricing rules'}
          </Text>
          <Hairline />
        </View>

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
        onDigit={key}
        onBackspace={() => {
          setAwaitingAnswer(false);
          setAsk(digits.slice(0, -1));
        }}
        onClear={() => {
          setAwaitingAnswer(false);
          setCounter(null);
          setAsk('');
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
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
