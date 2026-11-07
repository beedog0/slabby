// What the scanner has read so far: one pill per field it needs. A pill is dim while the field is
// missing, half-lit once it's been seen in one frame, and lights up solid with the value read the
// moment it's confirmed, with a small pop and a tick. Used for the slab label (Name · Grade · Cert)
// and for loose cards (Name · Number · Set).

import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
// Camera chrome: looks the same in light and dark, like the rest of Scan's camera overlay.
import { light as color, space, type } from '../../theme/tokens';

export type PillState = 'none' | 'seen' | 'done';
export type ScanPill = { key: string; label: string; state: PillState; value?: string };

export function ScanPills({ pills }: { pills: ScanPill[] }) {
  return (
    <View style={styles.row} accessibilityLabel={pills.map((p) => `${p.label} ${p.state === 'done' ? 'read' : 'not read yet'}`).join(', ')}>
      {pills.map((p) => (
        <Pill key={p.key} pill={p} />
      ))}
    </View>
  );
}

function Pill({ pill }: { pill: ScanPill }) {
  const done = pill.state === 'done';
  const pop = useRef(new Animated.Value(1)).current;
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current) {
      Haptics.selectionAsync().catch(() => {});
      pop.setValue(0.85);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    }
    was.current = done;
  }, [done]);

  return (
    <Animated.View style={[styles.pill, done ? styles.done : pill.state === 'seen' ? styles.seen : styles.none, { transform: [{ scale: pop }] }]}>
      <Text numberOfLines={1} style={[type.secondary, styles.text, { color: done ? color.ink : color.onInk, opacity: done ? 1 : pill.state === 'seen' ? 0.85 : 0.55 }]}>
        {done && pill.value ? pill.value : pill.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: space.s, paddingTop: space.m, maxWidth: '100%' },
  pill: { height: 28, borderRadius: 14, paddingHorizontal: space.m, justifyContent: 'center', maxWidth: 160 },
  none: { backgroundColor: color.scanHint, borderWidth: 1, borderColor: color.scanGuide },
  seen: { backgroundColor: color.scanHint, borderWidth: 1, borderColor: color.conFill },
  done: { backgroundColor: color.canvas, borderWidth: 1, borderColor: color.canvas },
  text: { fontWeight: '500' },
});
