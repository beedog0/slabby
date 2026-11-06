import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { color, radius, space, type } from '../theme/tokens';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
};

export function Segmented<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View accessibilityRole="tablist" style={[styles.track, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, on && styles.on]}
          >
            <Text numberOfLines={1} style={[type.secondary, { color: color.ink, fontWeight: on ? '600' : '500' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 36,
    borderRadius: radius.segmented,
    backgroundColor: color.well,
    padding: 2,
    flexDirection: 'row',
    gap: 2,
  },
  seg: { flex: 1, borderRadius: radius.segmented - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  on: {
    backgroundColor: color.canvas,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
});
