import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, space, type } from '../theme/tokens';

type Props = { onDigit: (d: string) => void; onBackspace: () => void; onClear?: () => void; bottomInset?: number };

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'del'],
];

export function Keypad({ onDigit, onBackspace, onClear, bottomInset = 0 }: Props) {
  return (
    <View style={[styles.pad, { paddingBottom: space.s + bottomInset }]}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k, i) => {
            if (k === 'clear') {
              if (!onClear) return <View key={i} style={styles.blank} />;
              return (
                <Pressable key={i} accessibilityRole="button" accessibilityLabel="Clear" onPress={onClear} style={styles.blank}>
                  <Text style={[type.body, { color: color.ink }]}>Clear</Text>
                </Pressable>
              );
            }
            if (k === 'del') {
              return (
                <Pressable key={i} accessibilityRole="button" accessibilityLabel="Delete" onPress={onBackspace} style={styles.blank}>
                  <Svg width={26} height={20} viewBox="0 0 26 20" fill="none" stroke={color.ink} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round">
                    <Path d="M8 2h15a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8l-6-8 6-8zM12 7l6 6M18 7l-6 6" />
                  </Svg>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => onDigit(k)}
                style={({ pressed }) => [styles.key, pressed && { backgroundColor: color.hairline }]}
              >
                <Text style={[type.title, { fontWeight: '400', color: color.ink }]}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: color.well, paddingTop: space.s, paddingHorizontal: 6, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  key: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 1 },
  },
  blank: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
});
