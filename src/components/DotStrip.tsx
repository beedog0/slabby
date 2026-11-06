// Sales screen dot strip: one ink dot per sale (or per day's average) along a hairline, a median
// tick, and the user's floor as a small loss-coloured tick. Low/high (10th/90th) captions sit
// under their positions. The caller only draws it with five or more points.

import { Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { money } from '../lib/format';
import { color, size, type } from '../theme/tokens';

type Props = {
  points: number[];
  medianCents: number;
  lowCents: number;
  highCents: number;
  floorCents?: number | null;
  width: number;
};

const PAD = size.dot;
const LABEL_W = 72;

export function DotStrip({ points, medianCents, lowCents, highCents, floorCents, width }: Props) {
  let lo = Math.min(...points);
  let hi = Math.max(...points);
  // The floor joins the scale when it's near the sales; far below, it would squash the dots.
  const showFloor = floorCents != null && floorCents > 0 && floorCents >= lo - (hi - lo) * 0.25 && floorCents <= hi;
  if (showFloor) lo = Math.min(lo, floorCents!);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (width - PAD * 2);
  const mid = size.dotStrip / 2;

  const label = (v: number, text = money(v), w = LABEL_W) => {
    const left = x(v) - w / 2;
    const clamped = Math.max(0, Math.min(width - w, left));
    const align = clamped > left ? 'left' : clamped < left ? 'right' : 'center';
    return (
      <Text numberOfLines={1} style={[type.caption, { position: 'absolute', left: clamped, width: w, textAlign: align, color: color.secondary }]}>
        {text}
      </Text>
    );
  };

  return (
    <View accessibilityLabel={`${points.length} sales from ${money(Math.min(...points))} to ${money(Math.max(...points))}`}>
      <Svg width={width} height={size.dotStrip}>
        <Line x1={0} x2={width} y1={mid} y2={mid} stroke={color.hairline} strokeWidth={size.hairline} />
        {points.map((v, i) => (
          <Circle key={i} cx={x(v)} cy={mid} r={size.dot / 2} fill={color.ink} fillOpacity={0.35} />
        ))}
        <Rect x={x(medianCents) - 1} y={mid - size.medianTick / 2} width={2} height={size.medianTick} fill={color.ink} />
        {showFloor ? (
          <Rect x={x(floorCents!) - 1} y={mid - size.floorTick / 2} width={2} height={size.floorTick} fill={color.loss} />
        ) : null}
      </Svg>
      <View style={{ height: type.caption.fontSize + 4 }}>
        {x(highCents) - x(lowCents) >= LABEL_W ? (
          <>
            {label(lowCents)}
            {label(highCents)}
          </>
        ) : (
          label((lowCents + highCents) / 2, `${money(lowCents)}–${money(highCents).replace('$', '')}`, LABEL_W * 2)
        )}
      </View>
    </View>
  );
}
