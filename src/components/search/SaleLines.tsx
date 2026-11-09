// Under a graded headline price: what it is ("Median of last 5 sales" or "Last sold Oct 9") and
// the sales behind it, newest first, one line per day ("$310 · avg of 3 · Oct 9"). Pricing math
// is in src/pricing/lastSales.ts; this only prints it.

import { Text, View } from 'react-native';
import { money } from '../../lib/format';
import { shortDay } from '../../pricing/buySignal';
import type { Headlined } from '../../pricing/lastSales';
import { space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';

export function headlineLabel(p: Headlined): string | null {
  if (!p.basis || !p.recent?.length) return null;
  if (p.basis === 'median5') return 'Median of last 5 sales';
  const last = `Last sold ${shortDay(p.recent[0].day)}`;
  const total = p.recent.reduce((s, d) => s + d.count, 0);
  return total >= 5 ? `${last} · no sale in 90 days` : `${last} · only ${total} sale${total === 1 ? '' : 's'} in 6 months`;
}

export function SaleLines({ price, style }: { price: Headlined | null | undefined; style?: object }) {
  const color = useColors();
  const label = price ? headlineLabel(price) : null;
  if (!price || !label) return null;
  return (
    <View style={[{ paddingTop: space.m, gap: 2 }, style]} accessible accessibilityLabel={`${label}. ${price.recent!.map(line).join('. ')}`}>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
      {price.recent!.map((d) => (
        <Text key={d.day} style={[type.secondary, { color: color.ink }]}>
          {money(d.cents)}
          <Text style={{ color: color.secondary }}>
            {d.count > 1 ? ` · avg of ${d.count}` : ''} · {shortDay(d.day)}
          </Text>
        </Text>
      ))}
    </View>
  );
}

const line = (d: { cents: number; count: number; day: string }) => `${money(d.cents)}${d.count > 1 ? `, average of ${d.count}` : ''}, ${shortDay(d.day)}`;
