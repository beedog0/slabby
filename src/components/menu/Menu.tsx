// Slabby's … menu. Replaces the stock iOS action sheet everywhere a slab or screen has more actions.
// It's the same sheet language as the scan result (02-scan.png): white, 28 pt top corners, grabber,
// the slab's thumbnail and name on top, then plain text rows split by hairlines. No icons, no
// colored text, no shadow; a flat scrim is the only thing that separates it from the page.
//
// The host is mounted once at the root; call openMenu({...}) anywhere. An item's action runs after
// the sheet has closed, so pushing a screen or opening the share sheet never fights the modal.
//
// Motion: the sheet waits off screen until it has been measured, then slides up on the native
// driver. Starting before the measure (and swapping the animated node when the height arrived)
// is what made it open in visible steps on the phone.

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { cardLabel, rowTitle } from '../../lib/format';
import { motion, radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { SlabView } from '../SlabView';
import { SheetScope, useSheetDrag } from '../sheet/useSheetDrag';
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
  /**
   * Content between the header and the rows: a confirm step's live numbers and its one button.
   * It closes the sheet itself with closeMenu(then).
   */
  body?: ReactNode;
};

let request: ((spec: MenuSpec) => void) | null = null;
let closer: ((then?: () => void) => void) | null = null;

/** Close the open sheet, then run `then` (e.g. save, or open the next sheet). */
export function closeMenu(then?: () => void) {
  closer?.(then);
}

/** Open the … menu. Safe to call from anywhere once MenuHost is mounted. */
export function openMenu(spec: MenuSpec) {
  request?.(spec);
}

export function groupsOf(items: MenuSpec['items']): MenuItem[][] {
  if (items.length === 0) return [];
  return Array.isArray(items[0]) ? (items as MenuItem[][]).filter((g) => g.length) : [items as MenuItem[]];
}

export function MenuHost() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [spec, setSpec] = useState<MenuSpec | null>(null);
  const native = Platform.OS !== 'web';
  // Sheet offset (its height when hidden, 0 when shown) and scrim opacity, both on the native driver.
  const offset = useRef(new Animated.Value(screenH)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // Pull down anywhere on the sheet to close it (shared with every sheet; see sheet/sheetGesture.ts).
  const closeRef = useRef(() => {});
  const sheet = useSheetDrag(() => closeRef.current());
  const drag = sheet.drag;
  // One animated node for the whole life of the host, so nothing is re-attached mid-animation.
  const translateY = useRef(Animated.add(offset, drag)).current;
  const sheetH = useRef(screenH);
  const opened = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    request = (s) => {
      closing.current = false;
      opened.current = false;
      sheet.reset();
      fade.setValue(0);
      offset.setValue(screenH);
      setSpec(s);
    };
    return () => {
      request = null;
    };
  }, [drag, fade, offset, screenH]);

  // Runs once the sheet has its real height: place it just below the screen edge, then slide up.
  const onSheetLayout = (h: number) => {
    sheetH.current = h;
    if (opened.current || closing.current) return;
    opened.current = true;
    offset.setValue(h);
    if (native) Haptics.selectionAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(offset, { toValue: 0, duration: motion.sheetIn, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fade, { toValue: 1, duration: motion.sheetIn, easing: Easing.out(Easing.quad), useNativeDriver: native }),
    ]).start();
  };

  const close = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(offset, { toValue: sheetH.current, duration: motion.sheetOut, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fade, { toValue: 0, duration: motion.sheetOut, useNativeDriver: native }),
    ]).start(() => {
      setSpec(null);
      sheet.reset();
      then?.();
    });
  };

  closeRef.current = () => close();
  closer = close;

  if (!spec) return null;
  const groups = groupsOf(spec.items);
  const title = spec.title;
  const hasHeader = !!(spec.card || title);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: fade }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + space.s, transform: [{ translateY }] }]}
        {...sheet.panHandlers}
      >
        <SheetScope value={sheet.scope}>
        <View style={styles.grabber} />

        {hasHeader ? (
          <View style={styles.header}>
            {/* The real slab, label and all; the row thumbnail's grey label strip read as a blank top. */}
            {spec.card ? <SlabView card={spec.card} width={size.menuSlabW} posed={false} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              {title ? (
                <Text numberOfLines={1} style={[type.body, styles.title]}>
                  {title}
                </Text>
              ) : null}
              {spec.subtitle ? (
                <Text numberOfLines={1} style={[type.text, styles.subtitle]}>
                  {spec.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {spec.body ? (
          <View>
            {hasHeader ? <Hairline /> : null}
            {spec.body}
          </View>
        ) : null}

        {groups.map((group, gi) => (
          // Every row is split by the same hairline, groups included, so the rhythm stays even.
          <View key={gi}>
            {group.map((item, i) => (
              <View key={item.label}>
                {i > 0 || gi > 0 || hasHeader || spec.body ? <Hairline /> : null}
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
        </SheetScope>
      </Animated.View>
    </Modal>
  );
}

export function Check() {
  const color = useColors();
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 9.5l3.5 3.5 7.5-8" />
    </Svg>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sheet,
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
    marginBottom: space.m,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingBottom: space.m,
  },
  // Name and grade read as one block: semibold body over regular secondary, 2 pt apart.
  title: { color: color.ink, fontWeight: '600' },
  subtitle: { color: color.secondary, paddingTop: 2 },
  row: {
    minHeight: size.menuRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  // Pressed rows dim like the rest of the app's text buttons; no highlight box.
  pressed: { opacity: 0.45 },
  // Regular weight, like iOS menus; the header carries the only semibold text.
  label: { flex: 1, color: color.ink, fontWeight: '400' },
  cancel: {
    height: size.menuRow,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
}));

/** A slab's menu: its thumbnail, name and grade on top, so you know which slab you're acting on. */
export function openSlabMenu(card: Card, items: MenuSpec['items']) {
  openMenu({ card, title: rowTitle(card), subtitle: cardLabel(card), items });
}
