// Select mode: a picked slab gets an ink outline a few points outside its case. Nothing on the
// slabs that aren't picked, so the shelf still looks like the shelf.

import { View } from 'react-native';
import { color, size } from '../../theme/tokens';
import { slabLayout } from '../slab/geometry';

export function SelectOutline({ on, slabW }: { on: boolean; slabW: number }) {
  if (!on) return null;
  const gap = size.selectGap;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -gap,
        left: -gap,
        right: -gap,
        bottom: -gap,
        borderWidth: size.selectLine,
        borderColor: color.ink,
        borderRadius: slabLayout(slabW).corner + gap,
      }}
    />
  );
}
