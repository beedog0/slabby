// Slab detail chart: daily market as a line, a dashed reference at what you paid, a dot on today.
// Reference: 03-slab-detail.png.

import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { money } from '../lib/format';
import { downsample } from './Sparkline';
import { color, type } from '../theme/tokens';

type Props = { values: number[]; paidCents: number | null; width: number; height?: number };

const PAD = 8;

export function PriceChart({ values: raw, paidCents, width, height = 140 }: Props) {
  // ~16 points reads as a trend line, like the reference, instead of daily noise.
  const values = downsample(raw, 16);
  if (values.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center' }}>
        <Text style={[type.text, { color: color.secondary }]}>Not enough sales yet to draw a chart.</Text>
      </View>
    );
  }
  const all = paidCents != null ? [...values, paidCents] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - PAD);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (height - PAD * 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const paidY = paidCents != null ? y(paidCents) : null;
  // Paid label sits just under the dashed line, or above it when the line is near the bottom.
  const labelTop = paidY == null ? 0 : paidY + 18 > height ? paidY - 20 : paidY + 2;

  return (
    <View style={{ width, height }} accessibilityLabel={`Price chart, now ${money(last)}`}>
      <Svg width={width} height={height}>
        {paidY != null ? (
          <Line x1={0} x2={width} y1={paidY} y2={paidY} stroke={color.hairline} strokeWidth={1.5} strokeDasharray="3 5" />
        ) : null}
        <Path d={d} stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={x(values.length - 1)} cy={y(last)} r={6} fill={color.ink} />
      </Svg>
      {paidCents != null ? (
        <Text style={[type.secondary, { color: color.secondary, position: 'absolute', right: 0, top: labelTop }]}>
          paid {money(paidCents)}
        </Text>
      ) : null}
    </View>
  );
}
