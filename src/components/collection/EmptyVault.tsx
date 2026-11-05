// First run: an outlined slab (the same outline a scanned slab fades in from) and one line of copy.

import { StyleSheet, Text, View } from 'react-native';
import { color, radius, size, space, type } from '../../theme/tokens';

export function EmptyVault() {
  return (
    <View style={styles.wrap}>
      <View style={styles.slab}>
        <View style={styles.label} />
        <View style={styles.art} />
      </View>
      <Text style={[type.section, { color: color.ink, paddingTop: space.xxl }]}>Your collection starts here</Text>
      <Text style={[type.text, { color: color.secondary, textAlign: 'center', paddingTop: space.s, maxWidth: 280 }]}>
        Scan the QR code on a PSA label to add your first slab.
      </Text>
    </View>
  );
}

const line = { borderWidth: 1.5, borderColor: color.ghost } as const;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: space.xxl, paddingHorizontal: space.gutter },
  slab: { width: size.heroW * 0.8, height: size.heroH * 0.8, borderRadius: radius.slab, padding: 8, gap: 6, ...line },
  label: { height: 40, borderRadius: 3, ...line },
  art: { flex: 1, borderRadius: 4, ...line },
});
