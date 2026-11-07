// The iOS number pad has no return key, so a number field can't be closed. This puts a "Done" bar
// above the keyboard for any TextInput with inputAccessoryViewID={KEYBOARD_DONE}, and
// useKeyboardHeight lets an absolutely placed sheet sit on top of the keyboard instead of under it.

import { useEffect, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { size, space, type } from '../theme/tokens';
import { themed, useColors } from '../theme/theme';

export const KEYBOARD_DONE = 'keyboard-done';

/** Mount once per screen that has number fields. Renders nothing off iOS. */
export function KeyboardDone() {
  const color = useColors();
  const styles = useStyles();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} style={styles.done} hitSlop={8}>
          <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** Height of the on-screen keyboard (including any accessory bar), 0 when it's closed. */
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setH(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

const useStyles = themed((color) => StyleSheet.create({
  bar: {
    height: size.touch,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    backgroundColor: color.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  done: { minHeight: size.touch, justifyContent: 'center' },
}));
