// The scan sheet's second step after tapping Sell: one question, what you want for it. Opens on
// what your pricing rules would ask (market + ask%), so a tap on Continue is enough.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { money } from '../../lib/format';
import { KEYBOARD_DONE } from '../KeyboardDone';
import { color, size, space, type } from '../../theme/tokens';
import { PrimaryButton } from '../ui';

type Props = {
  marketCents: number | null;
  /** Your rules' ask at this market; prefilled. */
  suggestedCents: number | null;
  onContinue: (askCents: number) => void;
  onBack: () => void;
};

export function AskStep({ marketCents, suggestedCents, onContinue, onBack }: Props) {
  const [dollars, setDollars] = useState(suggestedCents ? String(Math.round(suggestedCents / 100)) : '');
  const cents = parseInt(dollars, 10) * 100;
  const ok = Number.isFinite(cents) && cents > 0;

  return (
    <>
      <Text style={[type.section, { color: color.ink }]}>What do you want for it?</Text>
      <TextInput
        autoFocus
        value={dollars ? `$${Number(dollars).toLocaleString('en-US')}` : ''}
        onChangeText={(t) => setDollars(t.replace(/[^0-9]/g, '').slice(0, 7))}
        placeholder="$0"
        placeholderTextColor={color.hairline}
        keyboardType="number-pad"
        inputAccessoryViewID={KEYBOARD_DONE}
        returnKeyType="done"
        onSubmitEditing={() => ok && onContinue(cents)}
        accessibilityLabel="Asking price"
        style={[type.displayM, styles.input]}
      />
      <Text style={[type.text, { color: color.secondary }]}>
        {marketCents
          ? `Market ${money(marketCents)}${suggestedCents ? ` · your rules ask ${money(suggestedCents)}` : ''}`
          : 'No market price yet'}
      </Text>
      <PrimaryButton style={{ marginTop: space.xl, opacity: ok ? 1 : 0.4 }} title="See how it prices" onPress={() => ok && onContinue(cents)} />
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.quiet}>
        <Text style={[type.text, { color: color.secondary }]}>Back</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  input: { color: color.ink, paddingVertical: space.m },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center', marginTop: space.s },
});
