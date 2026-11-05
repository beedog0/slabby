// 56×24 sparkline. Color by 30-day trend: gain above +3%, loss below −3%, secondary otherwise.

import Svg, { Path } from 'react-native-svg';
import { color, size, trendThreshold } from '../theme/tokens';

export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - lo) / span) * (h - pad * 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Downsample to `n` points so 30 noisy days read as a shape, not fuzz. */
export function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const step = (values.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)]);
}

export function trendColor(change: number): string {
  if (change > trendThreshold) return color.gain;
  if (change < -trendThreshold) return color.loss;
  return color.secondary;
}

export function Sparkline({ values, change }: { values: number[]; change: number }) {
  const d = sparkPath(downsample(values, 8), size.sparkW, size.sparkH);
  return (
    <Svg width={size.sparkW} height={size.sparkH}>
      <Path d={d} stroke={trendColor(change)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
