// Select mode's mark on a slab: an empty ring, or a filled ink circle with a check when picked.
// Sits on the slab's bottom-right corner, clear of the label and its grade. Ink, not color, so it reads as chrome, not a number.

import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, size } from '../../theme/tokens';

export function SelectMark({ on }: { on: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.mark, on ? styles.on : styles.off]}>
      {on ? (
        <Svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke={color.onInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3.5 9.5l3.5 3.5 7.5-8" />
        </Svg>
      ) : null}
    </View>
  );
}

const D = size.selectMark;
const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: D,
    height: D,
    borderRadius: D / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: { backgroundColor: color.ink },
  off: { backgroundColor: color.canvas, borderWidth: 1.5, borderColor: color.secondary },
});
