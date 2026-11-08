// Card page, for a card no price source covers (Korean and Chinese promos, some old JP promos).
// Instead of the chart and the eBay/TCGplayer row it offers "Find a price": an AI search of sold
// listings online, shown as "Estimate · from N sales found online" with every link behind a tap.
// It's never presented as a comp. "Type your own price" is always there as the fallback, and
// your own price wins over the estimate.

import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { money, shortDay } from '../../lib/format';
import { cardKey } from '../../pricing/cardKey';
import { estimateLine } from '../../pricing/estimate';
import type { CardPrice } from '../../services/comps';
import { estimateEntry, findPrice, ownPrice, setOwnPrice, type FindResult } from '../../services/estimate';
import { color, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { estimateIsFresh, type Estimate, type EstimateSale } from '../../../supabase/functions/_shared/estimate-math';
import { useEstimates } from '../../store/estimates';
import { Keypad } from '../Keypad';
import { closeMenu, openMenu } from '../menu/Menu';
import { SheetScrollView } from '../sheet/useSheetDrag';
import { Chevron, Hairline, PrimaryButton } from '../ui';

const FAILED: Partial<Record<FindResult, string>> = {
  capped: 'Today’s searches are used up. Try again tomorrow, or type your own price.',
  offline: 'Can’t search without a connection.',
  error: 'Couldn’t search right now. Try again in a minute.',
};

export function NoPriceSource({ card, price }: { card: Card; price: CardPrice | null }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FindResult | null>(null);
  // Subscribed so a finished search shows here at once.
  useEstimates((s) => s.byKey[cardKey(card)]);
  const entry = estimateEntry(card);
  const estimate = price?.estimate ?? (entry?.kind === 'found' ? entry.estimate : undefined);
  const own = price?.source === 'own' ? price.marketCents : null;
  const searchedNone = entry?.kind === 'none';

  const find = async () => {
    setBusy(true);
    setFailed(null);
    const r = await findPrice(card);
    setBusy(false);
    if (r !== 'found' && r !== 'none') setFailed(r);
  };

  return (
    <View>
      {own != null ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Your price ${money(own)}. Change it`}
            onPress={() => openOwnPrice(card)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
          >
            <View style={styles.line}>
              <Text style={[type.body, styles.label]}>Your price</Text>
              <View style={styles.link}>
                <Text style={[type.body, styles.num]}>{money(own)}</Text>
                <Chevron />
              </View>
            </View>
            <Text style={[type.secondary, styles.sub]}>Typed by you. No price source covers this card.</Text>
          </Pressable>
          <Hairline />
        </>
      ) : null}

      {estimate ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Shows the sales it came from"
            onPress={() => openEstimateSales(estimate)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
          >
            <View style={styles.line}>
              <Text style={[type.body, styles.label]}>{estimateLine(estimate.sales.length)}</Text>
              <View style={styles.link}>
                <Text style={[type.body, styles.num]}>
                  {estimate.lowCents === estimate.highCents ? money(estimate.priceCents) : `${money(estimate.lowCents)}–${money(estimate.highCents).replace('$', '')}`}
                </Text>
                <Chevron />
              </View>
            </View>
            <Text style={[type.secondary, styles.sub]}>Not a comp · searched {shortDay(estimate.foundAt.slice(0, 10))}</Text>
          </Pressable>
          <Hairline />
        </>
      ) : null}

      {!estimate && own == null ? (
        <View style={styles.empty}>
          <Text style={[type.body, styles.label]}>{searchedNone ? 'No sales found online' : 'No price source for this card'}</Text>
          <Text style={[type.secondary, styles.sub]}>
            {searchedNone
              ? `Searched ${shortDay(entry.foundAt.slice(0, 10))}. Slabby can search again in a week. Until then, type the price you’d go by.`
              : 'eBay and TCGplayer data don’t cover it. Slabby can search sold listings online for an estimate, with the links it found.'}
          </Text>
          {searchedNone ? (
            <PrimaryButton title="Type your own price" onPress={() => openOwnPrice(card)} style={styles.button} />
          ) : (
            <PrimaryButton title={busy ? 'Searching sold listings…' : 'Find a price'} onPress={busy ? () => {} : find} style={styles.button} />
          )}
          {failed ? <Text style={[type.secondary, styles.sub, { textAlign: 'center' }]}>{FAILED[failed]}</Text> : null}
          {busy ? <Text style={[type.secondary, styles.sub, { textAlign: 'center' }]}>This takes about half a minute.</Text> : null}
        </View>
      ) : null}

      {estimate && !estimateIsFresh(estimate.foundAt) ? (
        <Pressable accessibilityRole="button" onPress={busy ? undefined : find} style={({ pressed }) => [styles.quiet, pressed && { opacity: 0.5 }]}>
          <Text style={[type.body, { color: color.secondary }]}>{busy ? 'Searching sold listings…' : 'Search again'}</Text>
        </Pressable>
      ) : null}
      {estimate && failed ? <Text style={[type.secondary, styles.sub, { textAlign: 'center' }]}>{FAILED[failed]}</Text> : null}

      {own == null && !searchedNone ? (
        <Pressable accessibilityRole="button" onPress={() => openOwnPrice(card)} style={({ pressed }) => [styles.quiet, pressed && { opacity: 0.5 }]}>
          <Text style={[type.body, { color: color.secondary }]}>Type your own price</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The sales behind an estimate, newest first. Each row opens its page. */
export function openEstimateSales(e: Estimate) {
  openMenu({
    title: estimateLine(e.sales.length),
    subtitle: `Median ${money(e.priceCents)}. Found by an AI web search, not a comp.`,
    items: [],
    body: <SalesList sales={e.sales} />,
  });
}

function SalesList({ sales }: { sales: EstimateSale[] }) {
  return (
    <SheetScrollView style={{ maxHeight: 420 }}>
      {sales.map((s, i) => (
        <View key={s.url}>
          {i ? <Hairline /> : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${s.title}, ${money(s.priceCents)}, ${s.source}. Opens the listing`}
            onPress={() => Linking.openURL(s.url).catch(() => {})}
            style={({ pressed }) => [styles.sale, pressed && { opacity: 0.5 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.text, { color: color.ink }]}>{s.title}</Text>
              <Text style={[type.secondary, { color: color.secondary }]}>{saleDetail(s)}</Text>
            </View>
            <Text style={[type.body, styles.num]}>{money(s.priceCents)}</Text>
          </Pressable>
        </View>
      ))}
    </SheetScrollView>
  );
}

/** "eBay · Oct 28 · ₩390,000". The original price only when it wasn't in dollars. */
export function saleDetail(s: Pick<EstimateSale, 'source' | 'soldOn' | 'amount' | 'currency'>): string {
  return [s.source, s.soldOn ? shortDay(s.soldOn) : 'date not shown', s.currency === 'USD' ? null : original(s.amount, s.currency)]
    .filter(Boolean)
    .join(' · ');
}

function original(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString('en-US')} ${currency}`;
  }
}

/** Keypad sheet for your own price. Saving 0 / clearing removes it. */
export function openOwnPrice(card: Card) {
  openMenu({ card, title: 'Your price', subtitle: 'Used for ask, floor and value until real prices exist.', items: [], body: <OwnPriceBody card={card} /> });
}

function OwnPriceBody({ card }: { card: Card }) {
  const current = ownPrice(card);
  const [digits, setDigits] = useState(current ? String(Math.round(current / 100)) : '');
  const cents = digits ? parseInt(digits, 10) * 100 : null;
  const clearing = cents == null && current != null;
  return (
    <View>
      <View style={styles.amount}>
        <Text style={[type.displayS, { color: cents != null ? color.ink : color.secondary }]}>{cents != null ? money(cents) : '$0'}</Text>
      </View>
      <View style={styles.pad}>
        <Keypad
          onDigit={(d) => setDigits((v) => (v.length >= 7 || (!v && d === '0') ? v : v + d))}
          onBackspace={() => setDigits((v) => v.slice(0, -1))}
          onClear={() => setDigits('')}
        />
      </View>
      <PrimaryButton
        title={clearing ? 'Clear your price' : cents != null ? `Save ${money(cents)}` : 'Type a price'}
        onPress={() => {
          if (cents == null && !clearing) return;
          closeMenu(() => setOwnPrice(card, cents));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.xl },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m },
  label: { color: color.ink, fontWeight: '400', flexShrink: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  num: { color: color.ink, fontVariant: ['tabular-nums'] },
  sub: { color: color.secondary, paddingTop: space.xs },
  empty: { paddingTop: space.xxl, gap: space.xs },
  button: { marginTop: space.l },
  quiet: { paddingVertical: space.l, alignItems: 'center' },
  sale: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  amount: { alignItems: 'center', paddingTop: space.l, paddingBottom: space.m },
  pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
});
