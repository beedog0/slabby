// Small ink badges that sit on a slab's top corners in every home view:
// - Pinned: a black disc with a white pin, on the top-left corner.
// - Copies: a black "2x" pill on the top-right corner when the same raw single is in the vault more
//   than once (they show as one card).
// Flat ink on white, no shadow, no color: they read like the label's grade, not like iOS badges.

import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Card } from '../../types';
// Marks sit on the slab, which looks the same in light and dark, so they keep the light palette.
import { light as color, size, type } from '../../theme/tokens';

/** Where the visible object sits inside SlabView's box: the whole slab, or the smaller raw card. */
function frame(card: Pick<Card, 'grader'>, slabW: number) {
  const h = (slabW * size.heroH) / size.heroW;
  if (card.grader !== 'raw') return { top: 0, left: 0, w: slabW, h };
  const w = slabW * 0.86;
  const ch = w * (88 / 63);
  return { top: (h - ch) / 2, left: (slabW - w) / 2, w, h: ch };
}

const badge = (slabW: number) => Math.round(Math.max(18, Math.min(24, slabW * 0.12)));

/** Place inside the relatively positioned wrapper around SlabView. */
export function PinMark({ slabW, card }: { slabW: number; card: Pick<Card, 'grader'> }) {
  const d = badge(slabW);
  const f = frame(card, slabW);
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="Pinned"
      style={{
        position: 'absolute',
        top: f.top - d * 0.35,
        left: f.left - d * 0.35,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: color.ink,
        borderWidth: 1.5,
        borderColor: color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
      }}
    >
      <Svg width={d * 0.6} height={d * 0.6} viewBox="0 0 24 24">
        {/* A pushpin leaning 45°, solid white. */}
        <Path
          d="M14.5 2.5l7 7-2.2.6-3.8 3.8.4 4.3-1.4 1.4-4.2-4.2-5.3 5.3-.9-.9 5.3-5.3-4.2-4.2 1.4-1.4 4.3.4 3.8-3.8z"
          fill={color.canvas}
        />
      </Svg>
    </View>
  );
}

export function CopiesMark({ slabW, card, copies }: { slabW: number; card: Pick<Card, 'grader'>; copies: number }) {
  if (copies < 2) return null;
  const d = badge(slabW);
  const f = frame(card, slabW);
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`${copies} copies`}
      style={{
        position: 'absolute',
        top: f.top - d * 0.35,
        right: slabW - (f.left + f.w) - d * 0.35,
        minWidth: d,
        height: d,
        paddingHorizontal: d * 0.3,
        borderRadius: d / 2,
        backgroundColor: color.ink,
        borderWidth: 1.5,
        borderColor: color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
      }}
    >
      <Text style={[type.caption, { color: color.canvas, fontWeight: '600', fontSize: Math.round(d * 0.52), lineHeight: Math.round(d * 0.7) }]}>
        {copies}x
      </Text>
    </View>
  );
}
