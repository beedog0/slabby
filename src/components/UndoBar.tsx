// A short-lived ink bar at the bottom: "Removed 2 slabs · Undo". Removing doesn't ask first;
// this is the way back. Mounted once at the root; call showUndo(text, undo) anywhere.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, motion, radius, size, space, type } from '../theme/tokens';

type Spec = { text: string; undo: () => void; key: number };

let request: ((s: Spec) => void) | null = null;
let seq = 0;

export function showUndo(text: string, undo: () => void) {
  request?.({ text, undo, key: ++seq });
}

export function UndoHost() {
  const insets = useSafeAreaInsets();
  const [spec, setSpec] = useState<Spec | null>(null);
  const shown = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  useEffect(() => {
    request = setSpec;
    return () => {
      request = null;
    };
  }, []);

  const hide = (then?: () => void) =>
    Animated.timing(shown, { toValue: 0, duration: motion.dropOut, useNativeDriver: native }).start(() => {
      setSpec(null);
      then?.();
    });

  useEffect(() => {
    if (!spec) return;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: motion.dropIn, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    const t = setTimeout(() => hide(), motion.undoMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  if (!spec) return null;
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [space.l, 0] });
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + space.s, opacity: shown, transform: [{ translateY }] }]}
    >
      <Animated.View style={styles.bar} accessibilityLiveRegion="polite">
        <Text numberOfLines={1} style={[type.text, styles.text]}>
          {spec.text}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const undo = spec.undo;
            hide(undo);
          }}
          style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.text, { color: color.onInk, fontWeight: '600' }]}>Undo</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.gutter, right: space.gutter },
  bar: {
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.l,
  },
  text: { flex: 1, color: color.onInk },
  undo: { height: size.button, justifyContent: 'center', paddingHorizontal: space.l },
});
