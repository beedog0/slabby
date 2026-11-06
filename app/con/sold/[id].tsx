// Con quick add → Sold: type what it sold for and record it, so it counts in today's totals.
// Selling under what you paid takes a second tap, like on Offer. After that, back to the Sold tab.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backToCon } from '../../../src/components/conStatusMenu';
import { Keypad } from '../../../src/components/Keypad';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle } from '../../../src/lib/format';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { DEFAULT_CON_NAME, useCon } from '../../../src/store/con';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

const MAX_DIGITS = 6;

export default function MarkSold() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  const session = useCon((s) => s.session);
  const startCon = useCon((s) => s.start);
  const [digits, setDigits] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!row) return null;
  const { card, price } = row;
  const cents = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;
  const keeps = card.paidCents != null && has ? cents - card.paidCents : null;

  const edit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setConfirm(null);
    setDigits(next);
  };

  const record = () => {
    const loss = keeps != null && keeps < 0 ? -keeps : 0;
    if (loss > 0 && !confirm) {
      setConfirm(`Tap again to sell at a ${money(loss)} loss`);
      timer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    let where = session?.name ?? null;
    if (!session) {
      startCon(DEFAULT_CON_NAME);
      where = DEFAULT_CON_NAME;
    }
    update(card.id, { status: 'sold', soldCents: cents, soldAt: new Date().toISOString(), soldWhere: where });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    backToCon('sold');
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
          <Text style={[type.text, { color: color.secondary }]}>Sold for</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: has ? color.ink : color.hairline }]}>
            {money(cents)}
          </Text>
          <Text style={[type.section, { color: color.secondary, minHeight: 26 }]}>
            {keeps != null ? (
              <>
                {keeps >= 0 ? 'Keeps ' : 'Loses '}
                <Text style={{ color: keeps >= 0 ? color.gain : color.loss }}>{money(Math.abs(keeps))}</Text>
              </>
            ) : null}
          </Text>
        </View>

        <View>
          <Hairline />
          <Text style={[type.text, { color: color.ink, paddingVertical: space.l }]}>
            {[
              card.paidCents != null ? `Paid ${money(card.paidCents)}` : null,
              row.floor != null ? `floor ${money(row.floor)}` : null,
              price ? `market ${money(price.marketCents)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No comps yet'}
          </Text>
          <Hairline />
        </View>

        {has ? (
          <View style={{ gap: space.s }}>
            <PrimaryButton title={`Sold for ${money(cents)}`} onPress={record} />
            <Pressable accessibilityRole="button" disabled={!confirm} onPress={record} style={styles.quiet}>
              <Text style={[type.body, { color: color.ink }]}>{confirm ?? ''}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ height: size.button + size.touch + space.s }} />
        )}
      </View>

      <Keypad
        bottomInset={insets.bottom}
        onDigit={(d) => {
          if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
          edit(digits + d);
        }}
        onBackspace={() => edit(digits.slice(0, -1))}
        onClear={() => edit('')}
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
