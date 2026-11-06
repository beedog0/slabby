// Compact … dropdown for screen-level menus (home). It opens right under the button that opened it
// and only takes the top corner, instead of a sheet covering the page. Same language as the sheet:
// white, text rows, inset hairlines, flat scrim, no shadow, no icons.
//
// Host mounted once at the root. Wrap the … button in a View with a ref and call
// openDropdown(ref, items).

import * as Haptics from "expo-haptics";
import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
} from "react";
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
} from "react-native";
import { color, motion, radius, size, space, type } from "../../theme/tokens";
import { groupsOf, type MenuItem, type MenuSpec } from "./Menu";

type Anchor = { x: number; y: number; w: number; h: number };
type Request = { anchor: Anchor; items: MenuSpec["items"] };

let request: ((r: Request) => void) | null = null;

/** Open a dropdown under the view in `anchor` (give that View collapsable={false}). */
export function openDropdown(
  anchor: RefObject<ComponentRef<typeof View> | null>,
  items: MenuSpec["items"],
) {
  const node = anchor.current;
  if (!node) return;
  node.measureInWindow((x, y, w, h) =>
    request?.({ anchor: { x, y, w, h }, items }),
  );
}

const native = Platform.OS !== "web";

export function DropdownHost() {
  const { width: screenW } = useWindowDimensions();
  const [req, setReq] = useState<Request | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    request = (r) => {
      closing.current = false;
      progress.setValue(0);
      setReq(r);
    };
    return () => {
      request = null;
    };
  }, [progress]);

  useEffect(() => {
    if (!req) return;
    if (native) Haptics.selectionAsync().catch(() => {});
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.dropIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [req, progress]);

  const close = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.dropOut,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: native,
    }).start(() => {
      setReq(null);
      then?.();
    });
  };

  if (!req) return null;
  const { anchor } = req;
  const groups = groupsOf(req.items);
  // Right edge sits on the page gutter (or the button's edge if it's further in).
  const right = Math.max(space.gutter, screenW - (anchor.x + anchor.w));
  const top = anchor.y + anchor.h + space.xs;
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color.scrimLight, opacity: progress },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={StyleSheet.absoluteFill}
          onPress={() => close()}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.panel,
          {
            top,
            right,
            opacity: progress,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        {groups.map((group, gi) => (
          <View key={gi} style={gi > 0 ? styles.group : undefined}>
            {group.map((item, i) => (
              <Row
                key={item.label}
                item={item}
                first={i === 0}
                onPress={() => close(item.onPress)}
              />
            ))}
          </View>
        ))}
      </Animated.View>
    </Modal>
  );
}

function Row({
  item,
  first,
  onPress,
}: {
  item: MenuItem;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <View>
      {first ? null : <View style={styles.hairline} />}
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: color.well },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[type.body, { color: color.ink, flex: 1 }]}
        >
          {item.label}
        </Text>
        {item.detail ? (
          <Text style={[type.text, { color: color.secondary }]}>
            {item.detail}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    width: size.dropdownW,
    backgroundColor: color.canvas,
    borderRadius: radius.button,
    overflow: "hidden",
    paddingVertical: space.xs,
  },
  row: {
    height: size.touch,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.l,
  },
  hairline: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.hairline,
    marginLeft: space.l,
  },
  // Groups split by a little air and a full-width line, not a heavier band.
  group: {
    marginTop: space.xs,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color.hairline,
  },
});
