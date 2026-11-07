// What you paid for a card: type it on the keypad, or say you don't know. Opened from
// "What you paid" on Before the table. An unknown cost hides the Paid marker, and
// "never sell at a loss" then has nothing to hold the floor to.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../../src/components/Keypad';
import { BackIcon, IconButton, PrimaryButton } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle } from '../../../src/lib/format';
import { useVault } from '../../../src/store/vault';
import { size, space, type } from '../../../src/theme/tokens';
import { useColors } from '../../../src/theme/theme';

const MAX_DIGITS = 6;

export default function WhatYouPaid() {
  const color = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const card = useVault((s) => s.cards.find((c) => c.id === id));
  const update = useVault((s) => s.update);
  // Start from the saved price; the first key replaces it rather than appending.
  const [digits, setDigits] = useState(card?.paidCents != null ? String(Math.round(card.paidCents / 100)) : '');
  const [fresh, setFresh] = useState(true);

  if (!card) return null;
  const cents = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;

  const save = (paidCents: number | null) => {
    update(card.id, { paidCents });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>
          {rowTitle(card)} · {gradeLabel(card.grader, card.grade, card.condition)}
        </Text>
        <View style={{ width: size.touch }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>What you paid</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: has ? color.ink : color.hairline }]}>
            {money(cents)}
          </Text>
          <Text style={[type.secondary, { color: color.secondary, minHeight: 18 }]}>
            {card.paidCents == null ? 'Not set' : ''}
          </Text>
        </View>

        <View style={{ gap: space.s }}>
          {has ? (
            <>
              <PrimaryButton title={`Save ${money(cents)}`} onPress={() => save(cents)} />
              <Pressable accessibilityRole="button" onPress={() => save(null)} style={styles.quiet}>
                <Text style={[type.body, { color: color.ink }]}>I don't know</Text>
              </Pressable>
            </>
          ) : (
            <>
              <PrimaryButton title="I don't know" onPress={() => save(null)} />
              <View style={styles.quiet} />
            </>
          )}
        </View>
      </View>

      <Keypad
        bottomInset={insets.bottom}
        onDigit={(d) => {
          setFresh(false);
          if (fresh || digits === '0') setDigits(d);
          else if (digits.length < MAX_DIGITS) setDigits(digits + d);
        }}
        onBackspace={() => {
          setFresh(false);
          setDigits(digits.slice(0, -1));
        }}
        onClear={() => {
          setFresh(false);
          setDigits('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter - 12,
  },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
