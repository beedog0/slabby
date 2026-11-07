// Wishlist price: how much you're looking to pay for a card at a grade. You see the market, the
// 90-day chart with your price drawn across it, how your price rates today (Steal / Good buy /
// Fair / Over market), and how it would have rated over the last 90 days. Type a price, or skip
// typing and Slabby fills in your buying max (a Good buy).

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../../src/components/Keypad';
import { PriceChart } from '../../../src/components/PriceChart';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../../src/components/ui';
import { money } from '../../../src/lib/format';
import { BUY_RATING_LABEL, buyRating, ratingHistory, type BuyRatingKind } from '../../../src/pricing/rules';
import {
  buyPrices,
  catalogCard,
  displayName,
  cardNumber,
  gradeLabel,
  openPrices,
  type CatalogCard,
  type SearchPrices,
} from '../../../src/services/search';
import { useRules } from '../../../src/store/rules';
import { useWishlist, wishKey, type WishGrade } from '../../../src/store/wishlist';
import { size, space, type } from '../../../src/theme/tokens';
import { useColors } from '../../../src/theme/theme';

const MAX_DIGITS = 6;
const ORDER: BuyRatingKind[] = ['steal', 'good', 'fair', 'over'];

export default function WishlistPrice() {
  const color = useColors();
  const { id, grade: gradeParam } = useLocalSearchParams<{ id: string; grade?: string }>();
  const grade = (gradeParam || 'psa10') as WishGrade;
  const productId = Number(id);
  const key = wishKey(productId, grade);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rules = useRules((s) => s.rules);
  const existing = useWishlist((s) => s.items.find((i) => i.key === key));
  const put = useWishlist((s) => s.put);
  const remove = useWishlist((s) => s.remove);
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);
  const [digits, setDigits] = useState(existing && !existing.autoTarget ? String(Math.round(existing.targetCents / 100)) : '');

  useEffect(() => {
    let live = true;
    catalogCard(productId)
      .then((c) => live && setCard(c))
      .catch(() => {});
    openPrices(productId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    return () => {
      live = false;
    };
  }, [productId]);

  const price = prices === undefined ? undefined : grade === 'raw' ? prices?.raw : prices?.grades[grade];
  const market = price?.marketCents ?? null;
  const buy = buyPrices(market, rules);
  const typed = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;
  // Skipping the price fills in your buying max: the top of Good buy.
  const target = has ? typed : (buy?.max ?? null);
  const rating =
    buy && market && target ? buyRating(target, { targetCents: buy.target, maxCents: buy.max, marketCents: market }) : null;
  const series = price?.series90 ?? [];
  const history =
    target && series.length > 1
      ? ratingHistory(target, series, (m) => {
          const b = buyPrices(m, rules);
          return b ? { targetCents: b.target, maxCents: b.max } : null;
        })
      : null;
  const days = history ? ORDER.reduce((n, k) => n + history[k], 0) : 0;
  const name = card ? displayName(card.name) : '';
  const no = card ? cardNumber(card.number) : '';

  const save = () => {
    if (!card || !target) return;
    put({
      key,
      productId,
      grade,
      name,
      setName: card.setName,
      number: no || null,
      imageUrl: card.imageUrl,
      game: card.game,
      language: card.language,
      targetCents: target,
      autoTarget: !has,
      marketCents: market,
      marketAsOf: price?.asOf ?? null,
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>
          {name}
        </Text>
        <View style={{ width: size.touch }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>Looking to pay · {gradeLabel(grade)}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: has ? color.ink : color.secondary }]}>
            {target ? money(target) : '$0'}
          </Text>
          <Text style={[type.title, { color: color.ink, minHeight: 34 }]}>{rating ? BUY_RATING_LABEL[rating.kind] : ''}</Text>
          <Text style={[type.text, { color: color.secondary, minHeight: 20 }]}>
            {market == null
              ? prices === undefined
                ? 'Loading prices…'
                : `No ${gradeLabel(grade)} market price yet`
              : !has
                ? 'Your buying max. Type a price to change it'
                : `${Math.round((target! / market) * 100)}% of market ${money(market)}`}
          </Text>
        </View>

        {series.length > 1 ? (
          <PriceChart
            values={series}
            paidCents={target}
            width={width - space.gutter * 2}
            height={110}
            asOf={price?.asOf}
            lineLabel="you"
          />
        ) : null}

        <View>
          <Hairline />
          <Text style={[type.text, { color: color.ink, paddingVertical: space.m }]}>
            {history && days
              ? `Last ${days} days at ${target ? money(target) : ''}: ` +
                ORDER.filter((k) => history[k] > 0)
                  .map((k) => `${BUY_RATING_LABEL[k].toLowerCase()} ${history[k]}`)
                  .join(' · ')
              : buy
                ? `Open ${money(buy.target)} · pay up to ${money(buy.max)}`
                : ' '}
          </Text>
          <Hairline />
        </View>

        <View style={{ gap: space.xs }}>
          <PrimaryButton
            title={
              !target
                ? 'Type a price'
                : existing
                  ? `Save at ${money(target)}`
                  : has
                    ? `Add to wishlist at ${money(target)}`
                    : `Add at ${money(target)}`
            }
            onPress={save}
            style={target && card ? undefined : { opacity: 0.35 }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!existing}
            onPress={() => {
              remove(key);
              router.back();
            }}
            style={styles.quiet}
          >
            <Text style={[type.body, { color: color.ink }]}>{existing ? 'Remove from wishlist' : ''}</Text>
          </Pressable>
        </View>
      </View>

      <Keypad
        bottomInset={insets.bottom}
        onDigit={(d) => {
          if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
          setDigits(digits + d);
        }}
        onBackspace={() => setDigits(digits.slice(0, -1))}
        onClear={() => setDigits('')}
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
