// All / Holds / For sale / Sold as plain text tabs. The current one is ink and semibold.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CollectionFilter } from '../../pricing/portfolio';
import { color, size, space, type } from '../../theme/tokens';

const FILTERS: { value: CollectionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'hold', label: 'Holds' },
  { value: 'sell', label: 'For sale' },
  { value: 'sold', label: 'Sold' },
];

export function FilterTabs({ value, onChange }: { value: CollectionFilter; onChange: (f: CollectionFilter) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {FILTERS.map((f) => {
        const on = f.value === value;
        return (
          <Pressable
            key={f.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(f.value)}
            hitSlop={{ left: 6, right: 6 }}
            style={styles.tab}
          >
            <Text style={[type.text, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.l, flexShrink: 1 },
  tab: { height: size.touch, justifyContent: 'center' },
});
