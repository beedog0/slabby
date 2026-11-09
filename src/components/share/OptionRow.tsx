import { Pressable, StyleSheet, Text } from 'react-native';
import { size, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { Chevron } from '../ui';

/** A settings row under a share preview: label, current choice, chevron. */
export function OptionRow({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  const color = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={[type.body, { color: color.ink, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: color.secondary, fontWeight: '400' }]}>
        {detail}
        <Chevron />
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
});
