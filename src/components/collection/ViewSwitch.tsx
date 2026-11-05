// Shelf / Scroll / Grid switch: three quiet icons, the current one in ink.

import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { DisplayMode } from '../../store/display';
import { color, size } from '../../theme/tokens';

const MODES: { mode: DisplayMode; label: string }[] = [
  { mode: 'shelf', label: 'Shelf' },
  { mode: 'scroll', label: 'Scroll' },
  { mode: 'grid', label: 'Grid' },
];

export function ViewSwitch({ value, onChange }: { value: DisplayMode; onChange: (m: DisplayMode) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {MODES.map(({ mode, label }) => {
        const on = mode === value;
        return (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityLabel={`${label} view`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(mode)}
            style={styles.btn}
          >
            <ModeIcon mode={mode} tint={on ? color.ink : color.secondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

function ModeIcon({ mode, tint }: { mode: DisplayMode; tint: string }) {
  const stroke = { stroke: tint, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      {mode === 'shelf' ? (
        <>
          <Rect x={3.5} y={5} width={4} height={10} rx={1} {...stroke} />
          <Rect x={9} y={5} width={4} height={10} rx={1} {...stroke} />
          <Rect x={14.5} y={5} width={4} height={10} rx={1} {...stroke} />
          <Path d="M2 18h18" {...stroke} />
        </>
      ) : mode === 'scroll' ? (
        <>
          <Rect x={7} y={3} width={8} height={16} rx={1.5} {...stroke} />
          <Path d="M3 6v10M19 6v10" {...stroke} />
        </>
      ) : (
        <>
          <Rect x={3.5} y={3.5} width={6} height={6} rx={1} {...stroke} />
          <Rect x={12.5} y={3.5} width={6} height={6} rx={1} {...stroke} />
          <Rect x={3.5} y={12.5} width={6} height={6} rx={1} {...stroke} />
          <Rect x={12.5} y={12.5} width={6} height={6} rx={1} {...stroke} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  btn: { width: size.viewIcon, height: size.touch, alignItems: 'center', justifyContent: 'center' },
});
