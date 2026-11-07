// Select mode: a picked slab gets an ink outline a few points outside its case. Nothing on the
// slabs that aren't picked, so the shelf still looks like the shelf.

import { View } from 'react-native';
import { size } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { slabLayout } from '../slab/geometry';

export function SelectOutline({ on, slabW }: { on: boolean; slabW: number }) {
  const color = useColors();
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
