// Home: a small, quiet line of the collection's value, green when up over the window, red when
// down, ink within ±3% (the same threshold as sparklines and the trend sentence).

import Svg, { Path } from 'react-native-svg';
import { trendOf } from '../pricing/portfolio';
import { color, size, trendThreshold } from '../theme/tokens';
import { PriceChart } from './PriceChart';
import { downsample, sparkPath } from './Sparkline';

export const trendTint = (series: number[]) => {
  const t = trendOf(series, trendThreshold);
  return t === 'up' ? color.gain : t === 'down' ? color.loss : color.ink;
};

/** A bare line (no labels), for tight spots like the swipe view caption. */
export function MiniChart({ values, width, height = 40 }: { values: number[]; width: number; height?: number }) {
  if (values.length < 2) return null;
  const d = sparkPath(downsample(values, 24), width, height);
  return (
    <Svg width={width} height={height} accessibilityLabel="Price, last 30 days">
      <Path d={d} stroke={trendTint(values)} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** The home value line with light reference points: gridline prices on the right, start and end dates. */
export function ValueChart({
  values,
  width,
  asOf,
  onScrub,
}: {
  values: number[];
  width: number;
  asOf?: string;
  onScrub?: (point: { cents: number; date?: string } | null) => void;
}) {
  if (values.length < 2) return null;
  return (
    <PriceChart values={values} paidCents={null} width={width} height={size.homeChart} tint={trendTint(values)} asOf={asOf} compact onScrub={onScrub} />
  );
}
