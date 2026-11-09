// The graded headline, explained. priceCaption() goes under the big price ("Median of last 5
// sales" or "Last sold Oct 9 · only 2 sales in 6 months"); SaleList sits in Key stats and lists
// the sales behind it, newest first, one line per day ("$310 · avg of 3 · Oct 9"). Pricing math
// is in src/pricing/lastSales.ts; this only prints it.

import { Text, View } from 'react-native';
import { money } from '../../lib/format';
import { shortDay } from '../../pricing/buySignal';
import type { Headlined } from '../../pricing/lastSales';
import { color, space, type } from '../../theme/tokens';

const total = (p: Headlined) => (p.recent ?? []).reduce((s, d) => s + d.count, 0);

/** One line for under the headline price, or null when the price has no sale days behind it. */
export function priceCaption(p: Headlined | null | undefined, raw = false): string | null {
  // Raw is TCGplayer's one market price, not sales, so there's no sale list; say where it's from.
  if (raw) return p?.asOf ? `TCGplayer market · updated ${shortDay(p.asOf)}` : null;
  if (!p?.basis || !p.recent?.length) return null;
  if (p.basis === 'median5') return 'Median of last 5 sales';
  const n = total(p);
  const last = `Last sold ${shortDay(p.recent[0].day)}`;
  return n >= 5 ? `${last} · none in 90 days` : `${last} · ${n} sale${n === 1 ? '' : 's'} in 6 months`;
}

/** "Last 5 sales" (or "Last 2 sales"), then one line per sale day. Nothing without sales. */
export function SaleList({ price }: { price: Headlined | null | undefined }) {
  if (!price?.recent?.length) return null;
  const n = Math.min(5, total(price));
  const title = n === 1 ? 'Last sale' : `Last ${n} sales`;
  return (
    <View style={{ paddingTop: space.l, gap: 2 }} accessible accessibilityLabel={`${title}. ${price.recent.map(line).join('. ')}`}>
      <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.xs }]}>{title}</Text>
      {price.recent.map((d) => (
        <View key={d.day} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.m }}>
          <Text style={[type.text, { color: color.ink, fontWeight: '600' }]}>
            {money(d.cents)}
            {d.count > 1 ? <Text style={{ color: color.secondary, fontWeight: '400' }}> · avg of {d.count}</Text> : null}
          </Text>
          <Text style={[type.text, { color: color.secondary }]}>{shortDay(d.day)}</Text>
        </View>
      ))}
    </View>
  );
}

const line = (d: { cents: number; count: number; day: string }) => `${money(d.cents)}${d.count > 1 ? `, average of ${d.count}` : ''}, ${shortDay(d.day)}`;
