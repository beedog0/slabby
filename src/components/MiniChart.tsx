// Home: a small, quiet line of the collection's value, green when up over the window, red when down.

import Svg, { Path } from 'react-native-svg';
import { trendOf } from '../pricing/portfolio';
import { color } from '../theme/tokens';
import { downsample, sparkPath } from './Sparkline';

export const trendTint = (series: number[]) => {
  const t = trendOf(series);
  return t === 'up' ? color.gain : t === 'down' ? color.loss : color.ink;
};

export function MiniChart({ values, width, height = 40 }: { values: number[]; width: number; height?: number }) {
  if (values.length < 2) return null;
  const d = sparkPath(downsample(values, 24), width, height);
  return (
    <Svg width={width} height={height} accessibilityLabel="Collection value, last 30 days">
      <Path d={d} stroke={trendTint(values)} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
