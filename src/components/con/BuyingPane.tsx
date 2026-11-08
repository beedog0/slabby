// Con mode, Buying: what you've spent today and how far under market, a search field that looks up
// any card (with your open and most-to-pay prices), and today's buys. On a card, "They're asking…"
// rates the seller's price. Selling's totals and tabs never show buys.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { gradeLabel, money, rowTitle } from '../../lib/format';
import { boughtIn, buyMarket, conBuySummary, type CardRow } from '../../pricing/portfolio';
import { color, radius, size, space, type } from '../../theme/tokens';
import { CardThumb } from '../CardThumb';
import { Hairline, PrimaryButton, ScanIcon } from '../ui';
import { ArtImage } from '../ArtImage';
import { openMenu } from '../menu/Menu';
import { BUY_RATING_LABEL, buyRating } from '../../pricing/rules';
import { buyPrices, gradeLabel as searchGrade } from '../../services/search';
import { useRules } from '../../store/rules';
import { useWishlist, type WishItem } from '../../store/wishlist';

type Props = {
  rows: CardRow[];
  conId: string;
  bottomInset: number;
  flash: (id: string) => React.ReactNode;
};

const lookUp = () => router.push('/search?con=1');

export function BuyingPane({ rows, conId, bottomInset, flash }: Props) {
  const sum = conBuySummary(rows, conId);
  const bought = boughtIn(rows, conId);
  const wishes = useWishlist((s) => s.items);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.totals}>
        <Text style={[type.displayS, { color: color.ink }]}>{money(sum.spentCents)}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>
          spent today · {sum.count} {sum.count === 1 ? 'buy' : 'buys'}
          {sum.count && sum.underMarketCents ? ' · ' : ''}
          {sum.count && sum.underMarketCents ? (
            <Text style={{ color: sum.underMarketCents > 0 ? color.gain : color.loss }}>
              {money(Math.abs(sum.underMarketCents))} {sum.underMarketCents > 0 ? 'under' : 'over'} market
            </Text>
          ) : null}
        </Text>
      </View>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Look up a card to buy"
        onPress={lookUp}
        style={({ pressed }) => [styles.search, pressed && { opacity: 0.6 }]}
      >
        <Svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          stroke={color.secondary}
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <Circle cx={7} cy={7} r={5} />
          <Path d="M11 11l3.5 3.5" />
        </Svg>
        <Text style={[type.text, { color: color.secondary }]}>Search any card to rate a price</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.l, paddingBottom: space.xxl }}>
        {wishes.length ? (
          <>
            <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.xs }]}>Wishlist</Text>
            {wishes.map((w) => (
              <View key={w.key}>
                <WishRow item={w} />
                <Hairline inset={size.thumbW + space.m} />
              </View>
            ))}
            <View style={{ height: space.xl }} />
          </>
        ) : null}
        {bought.length ? (
          <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.xs }]}>Bought today</Text>
        ) : null}
        {bought.map((r) => {
          const c = r.card;
          const m = buyMarket(r);
          const under = m != null && c.paidCents != null ? m - c.paidCents : null;
          return (
            <View key={c.id}>
              {flash(c.id)}
              <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${c.id}`)} style={styles.row}>
                <CardThumb card={c} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
                    {rowTitle(c)}
                  </Text>
                  <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                    {gradeLabel(c.grader, c.grade, c.condition)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[type.rowPrice, { color: color.ink }]}>{money(c.paidCents ?? 0)}</Text>
                  <Text style={[type.secondary, { color: color.secondary }]}>
                    {under == null ? (
                      'paid'
                    ) : (
                      <>
                        <Text style={{ color: under >= 0 ? color.gain : color.loss }}>{money(Math.abs(under))}</Text>
                        {under >= 0 ? ' under' : ' over'}
                      </>
                    )}
                  </Text>
                </View>
              </Pressable>
              <Hairline inset={size.thumbW + space.m} />
            </View>
          );
        })}
        {bought.length === 0 && wishes.length === 0 ? (
          <Text style={[type.text, { color: color.secondary, paddingTop: space.s }]}>
            Nothing bought yet. Look up a card, type what they're asking, and Slabby rates it against your buying rules. Cards
            you're hunting can go on your wishlist with the price you want.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset + space.l }]}>
        <PrimaryButton style={{ flex: 1 }} title="Look up a card" onPress={lookUp} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Price check: scan their slab"
          onPress={() => router.push({ pathname: '/scan', params: { check: '1' } })}
          style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }]}
        >
          <ScanIcon />
        </Pressable>
      </View>
    </View>
  );
}

/** A wanted card: your price, how it rates against the last market seen, tap to rate their price. */
function WishRow({ item }: { item: WishItem }) {
  const rules = useRules((s) => s.rules);
  const remove = useWishlist((s) => s.remove);
  const b = buyPrices(item.marketCents, rules);
  const rating =
    b && item.marketCents
      ? buyRating(item.targetCents, { targetCents: b.target, maxCents: b.max, marketCents: item.marketCents })
      : null;
  const params = { id: String(item.productId), grade: item.grade };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Rate what they're asking"
      onPress={() => router.push({ pathname: '/con/buy/[id]', params })}
      onLongPress={() =>
        openMenu({
          title: item.name,
          subtitle: searchGrade(item.grade),
          items: [
            { label: "They're asking…", onPress: () => router.push({ pathname: '/con/buy/[id]', params }) },
            { label: 'Change my price', onPress: () => router.push({ pathname: '/con/want/[id]', params }) },
            { label: 'See card', onPress: () => router.push({ pathname: '/search/[id]', params: { ...params, con: '1' } }) },
            { label: 'Remove from wishlist', onPress: () => remove(item.key) },
          ],
        })
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.thumb}>
        {item.imageUrl ? <ArtImage uri={item.imageUrl} recyclingKey={item.key} style={{ flex: 1 }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {searchGrade(item.grade)}
          {item.marketCents ? ` · market ${money(item.marketCents)}` : ''}
          {rating ? ` · ${BUY_RATING_LABEL[rating.kind].toLowerCase()}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[type.rowPrice, { color: color.ink }]}>{money(item.targetCents)}</Text>
        <Text style={[type.secondary, { color: color.secondary }]}>{item.autoTarget ? 'your max' : 'want'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: 3, overflow: 'hidden', backgroundColor: color.well },
  totals: { paddingHorizontal: space.gutter, paddingTop: space.xl, gap: 2 },
  search: {
    height: size.touch,
    marginHorizontal: space.gutter,
    marginTop: space.xl,
    paddingHorizontal: space.m,
    borderRadius: radius.field,
    backgroundColor: color.well,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  row: { height: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m },
  footer: { flexDirection: 'row', gap: space.m, paddingHorizontal: space.gutter, paddingTop: space.s },
  icon: {
    width: size.button,
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
