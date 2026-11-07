// Sales screen dot strip: one ink dot per sale (or per day's average) along a hairline, a median
// tick, and the user's floor as a small loss-coloured tick when it falls inside the scale. The
// scale is the range of the non-outlier sales (stripScale); outliers sit hollow at the edges. No
// captions: the header above already shows the median and range. The caller only draws it with
// five or more points.

import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { money } from '../lib/format';
import { stripScale } from '../pricing/sales';
import { size } from '../theme/tokens';
import { useColors } from '../theme/theme';

type Props = {
  points: number[];
  /** The values outliers are judged against (salesValues); defaults to points. */
  values?: number[];
  medianCents: number;
  floorCents?: number | null;
  width: number;
};

const PAD = size.dot;

export function DotStrip({ points, values = points, medianCents, floorCents, width }: Props) {
  const color = useColors();
  const { lo, hi, flags } = stripScale(points, values);
  const span = width - PAD * 2;
  const x = (v: number) => PAD + Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * span;
  const mid = size.dotStrip / 2;
  const r = size.dot / 2;
  const showFloor = floorCents != null && floorCents > 0 && floorCents >= lo && floorCents <= hi;
  const showMedian = medianCents >= lo && medianCents <= hi;

  return (
    <View accessibilityLabel={`${points.length} sales from ${money(Math.min(...points))} to ${money(Math.max(...points))}`}>
      <Svg width={width} height={size.dotStrip}>
        <Line x1={0} x2={width} y1={mid} y2={mid} stroke={color.hairline} strokeWidth={size.hairline} />
        {points.map((v, i) =>
          flags[i] ? (
            <Circle
              key={i}
              cx={flags[i] === 'below' ? PAD : width - PAD}
              cy={mid}
              r={r - size.hairline / 2}
              fill={color.canvas}
              stroke={color.secondary}
              strokeWidth={size.hairline}
            />
          ) : (
            <Circle key={i} cx={x(v)} cy={mid} r={r} fill={color.ink} fillOpacity={0.35} />
          ),
        )}
        {showMedian ? (
          <Rect x={x(medianCents) - 1} y={mid - size.medianTick / 2} width={2} height={size.medianTick} fill={color.ink} />
        ) : null}
        {showFloor ? (
          <Rect x={x(floorCents!) - 1} y={mid - size.floorTick / 2} width={2} height={size.floorTick} fill={color.loss} />
        ) : null}
      </Svg>
    </View>
  );
}
