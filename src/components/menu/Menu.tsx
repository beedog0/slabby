// Slabby's … menu. Replaces the stock iOS action sheet everywhere a slab or screen has more actions.
// It's the same sheet language as the scan result (02-scan.png): white, 28 pt top corners, grabber,
// the slab's thumbnail and name on top, then plain text rows split by hairlines. No icons, no
// colored text, no shadow; a flat scrim is the only thing that separates it from the page.
//
// The host is mounted once at the root; call openMenu({...}) anywhere. An item's action runs after
// the sheet has closed, so pushing a screen or opening the share sheet never fights the modal.

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { gradeLabel, rowTitle } from '../../lib/format';
import { color, motion, radius, size, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { CardThumb } from '../CardThumb';
import { Hairline } from '../ui';

export type MenuItem = {
  label: string;
  onPress: () => void;
  /** Quiet right-hand text, e.g. the current value. */
  detail?: string;
  /** Shows a check: the current choice in a pick-one menu like Sort by. */
  selected?: boolean;
};

export type MenuSpec = {
  /** Header: a slab's thumbnail, name and grade line… */
  card?: Card;
  title?: string;
  subtitle?: string;
  /** Items in groups; groups are split by a wider gap instead of a heavier line. */
  items: MenuItem[] | MenuItem[][];
};

let request: ((spec: MenuSpec) => void) | null = null;

/** Open the … menu. Safe to call from anywhere once MenuHost is mounted. */
export function openMenu(spec: MenuSpec) {
  request?.(spec);
}

export function groupsOf(items: MenuSpec['items']): MenuItem[][] {
  if (items.length === 0) return [];
  return Array.isArray(items[0]) ? (items as MenuItem[][]).filter((g) => g.length) : [items as MenuItem[]];
}

export function MenuHost() {
  const insets = useSafeAreaInsets();
  const [spec, setSpec] = useState<MenuSpec | null>(null);
  const [sheetH, setSheetH] = useState(600);
  const progress = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown
  const drag = useRef(new Animated.Value(0)).current; // pull-down offset
  const closing = useRef(false);

  useEffect(() => {
    request = (s) => {
      closing.current = false;
      drag.setValue(0);
      progress.setValue(0);
      setSpec(s);
    };
    return () => {
      request = null;
    };
  }, [drag, progress]);

  useEffect(() => {
    if (!spec) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.sheetIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [spec, progress]);

  const close = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.sheetOut,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setSpec(null);
      drag.setValue(0);
      then?.();
    });
  };

  const closeRef = useRef(() => {});
  closeRef.current = () => close();

  // Pull the sheet down to dismiss it, like any iOS sheet.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) closeRef.current();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 0 }).start();
      },
    }),
  ).current;

  if (!spec) return null;
  const groups = groupsOf(spec.items);
  const title = spec.title;
  const hasHeader = !!(spec.card || title);

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }),
    drag,
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: progress }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + space.s, transform: [{ translateY }] }]}
        {...pan.panHandlers}
      >
        <View style={styles.grabber} />

        {hasHeader ? (
          <View style={styles.header}>
            {spec.card ? <CardThumb card={spec.card} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              {title ? (
                <Text numberOfLines={1} style={[type.section, { color: color.ink }]}>
                  {title}
                </Text>
              ) : null}
              {spec.subtitle ? (
                <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
                  {spec.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {groups.map((group, gi) => (
          <View key={gi} style={gi > 0 ? styles.groupGap : undefined}>
            {group.map((item, i) => (
              <View key={item.label}>
                {i > 0 || (gi === 0 && hasHeader) ? <Hairline /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={item.selected ? { selected: true } : undefined}
                  onPress={() => close(item.onPress)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={[type.body, styles.label]}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
                      {item.detail}
                    </Text>
                  ) : null}
                  {item.selected ? <Check /> : null}
                </Pressable>
              </View>
            ))}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => close()}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.5 }]}
        >
          <Text style={[type.body, { color: color.secondary }]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

export function Check() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 9.5l3.5 3.5 7.5-8" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
  },
  grabber: {
    alignSelf: 'center',
    width: size.grabberW,
    height: size.grabberH,
    borderRadius: size.grabberH / 2,
    backgroundColor: color.hairline,
    marginTop: space.s,
    marginBottom: space.l,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
    paddingBottom: space.l,
  },
  groupGap: { marginTop: space.l, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color.hairline },
  row: {
    minHeight: size.menuRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  // Pressed rows dim like the rest of the app's text buttons; no highlight box.
  pressed: { opacity: 0.45 },
  label: { flex: 1, color: color.ink },
  cancel: {
    height: size.menuRow,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.s,
  },
});

/** A slab's menu: its thumbnail, name and grade on top, so you know which slab you're acting on. */
export function openSlabMenu(card: Card, items: MenuSpec['items']) {
  openMenu({ card, title: rowTitle(card), subtitle: gradeLabel(card.grader, card.grade, card.condition), items });
}
