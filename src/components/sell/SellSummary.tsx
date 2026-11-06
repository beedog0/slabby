// Top of the sell page: your asking price (tap to change it), where it sits against market, and a
// rating against what the card cost you. Math lives in src/pricing/sell.ts and rules.ts.

import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { money, pct } from '../../lib/format';
import { ebayNet, floor } from '../../pricing/rules';
import { SELL_RATING_LABEL, costBasis, sellRating, sellRead, vsMarket, type Cost } from '../../pricing/sell';
import { KEYBOARD_DONE } from '../KeyboardDone';
import { color, space, type } from '../../theme/tokens';
import type { PricingRules } from '../../types';
import { PriceLine, type Tick } from '../PriceLine';
import { Hairline } from '../ui';

type Props = {
  askCents: number;
  onAsk: (cents: number) => void;
  marketCents: number | null;
  /** 30-day low for the floor rule; market when unknown. */
  lowCents: number | null;
  /** "PSA 10" or "Raw": which market this is. */
  gradeName: string;
  cost: Cost | null;
  /** Shown with a pull rated against its pack, e.g. "Surging Sparks Booster Pack". */
  packName?: string | null;
  rules: PricingRules;
};

export function SellSummary({ askCents, onAsk, marketCents, lowCents, gradeName, cost, packName, rules }: Props) {
  const [text, setText] = useState<string | null>(null);
  const m = vsMarket(askCents, marketCents);
  const basis = costBasis(cost);
  const rating = sellRating(askCents, cost);
  const floorCents = marketCents ? floor({ marketCents, low30Cents: lowCents ?? marketCents, paidCents: basis, rules }) : null;
  const read = sellRead(askCents, m, floorCents);

  const commit = () => {
    const d = parseInt((text ?? '').replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(d) && d > 0) onAsk(d * 100);
    setText(null);
  };

  const ticks: Tick[] = [{ value: askCents, label: 'Ask', color: color.ink, pin: true }];
  if (marketCents) ticks.push({ value: marketCents, label: 'Market', color: color.secondary });
  if (floorCents != null && floorCents !== askCents) ticks.push({ value: floorCents, label: 'Floor', color: color.ink });
  // A pull's pack price would squash the line to one end; the line below says it instead.
  if (basis != null && cost?.kind === 'paid') ticks.push({ value: basis, label: 'Paid', color: color.ink });

  return (
    <View>
      <Text style={[type.text, { color: color.secondary }]}>Your ask</Text>
      <TextInput
        value={text ?? money(askCents)}
        onFocus={() => setText(String(Math.round(askCents / 100)))}
        onChangeText={(t) => setText(t.replace(/[^0-9]/g, '').slice(0, 7))}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        inputAccessoryViewID={KEYBOARD_DONE}
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel="Your asking price"
        accessibilityHint="Tap to change it"
        style={[type.displayM, { color: color.ink, padding: 0 }]}
      />
      <Text style={[type.body, { color: color.ink, paddingTop: space.xs }]}>{marketLine(m, gradeName)}</Text>

      {ticks.length > 1 && marketCents ? (
        <View style={{ paddingTop: space.xl }}>
          <PriceLine ticks={ticks} dot={{ value: askCents, color: color.ink }} reserveAbove />
        </View>
      ) : null}

      <View style={{ paddingTop: space.xl }}>
        <Hairline />
      </View>
      <View style={{ paddingTop: space.l }} accessible>
        <Text style={[type.title, { color: color.ink }]}>{SELL_RATING_LABEL[rating.kind]}</Text>
        <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>{whyLine(rating, cost, packName)}</Text>
        {read.length ? <Text style={[type.text, { color: color.secondary, paddingTop: 2 }]}>{read.join(' · ')}</Text> : null}
        <Text style={[type.caption, { color: color.secondary, paddingTop: space.m }]}>
          Cash at a table. On eBay you’d keep {money(ebayNet(askCents))} after fees.
        </Text>
      </View>
    </View>
  );
}

/** "$30 above PSA 10 market (+12%)" with only the numbers in color. */
function marketLine(m: ReturnType<typeof vsMarket>, gradeName: string): ReactNode {
  if (!m) return <Text style={{ color: color.secondary }}>No {gradeName} market price yet</Text>;
  if (m.place === 'at') return `At ${gradeName} market`;
  const tint = m.place === 'above' ? color.gain : color.loss;
  return (
    <Text>
      {money(Math.abs(m.deltaCents))} {m.place} {gradeName} market <Text style={{ color: tint }}>({pct(m.pct)})</Text>
    </Text>
  );
}

function whyLine(r: ReturnType<typeof sellRating>, cost: Cost | null, packName?: string | null): ReactNode {
  if (r.kind === 'unknown')
    return cost?.kind === 'unknown' ? 'You weren’t sure what you paid, so there’s nothing to rate it against.' : 'Add what you paid on the scan to see your profit.';
  const p = r.profitCents!;
  const amount = (
    <Text style={{ color: p > 0 ? color.gain : p < 0 ? color.loss : color.ink }}>
      {p > 0 ? '+' : ''}
      {money(p)}
      {/* A percent over a $5 pack (or past 10×) reads as noise; the dollars say it. */}
      {r.pct != null && cost?.kind === 'paid' && Math.abs(p) >= 100 && Math.abs(r.pct) < 10 ? ` (${pct(r.pct)})` : ''}
    </Text>
  );
  if (r.kind === 'pure') return <Text>You pulled it, so all {amount} is yours.</Text>;
  if (cost?.kind === 'pulled')
    return (
      <Text>
        {amount} over the {money(r.costCents!)} {packName ? packName.replace(/booster pack/i, 'pack') : 'pack'} it came from
      </Text>
    );
  return (
    <Text>
      {amount} on the {money(r.costCents!)} you paid
    </Text>
  );
}
