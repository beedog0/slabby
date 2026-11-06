// A small ink pushpin on the top edge of a pinned slab: the one mark that says "this one's first".

import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '../../theme/tokens';

/** Place inside a relatively positioned wrapper around the slab. Scales with the slab width. */
export function PinMark({ slabW }: { slabW: number }) {
  const s = Math.round(Math.max(14, Math.min(22, slabW * 0.11)));
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="Pinned"
      style={{ position: 'absolute', top: -s * 0.55, left: (slabW - s) / 2, width: s, height: s, zIndex: 2 }}
    >
      <Svg width={s} height={s} viewBox="0 0 20 20">
        <Path d="M10 11v7" stroke={color.ink} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx={10} cy={7} r={6} fill={color.ink} />
        <Circle cx={8} cy={5} r={1.6} fill={color.canvas} opacity={0.5} />
      </Svg>
    </View>
  );
}
