// "What you paid" on the scan sheet, with two quiet answers for when there's no number to type:
// "Pulled it" (from a pack; the sell page rates against the pack price, else $0) and "Not sure"
// (no rating). Typing a price clears either one. Selection is an outline, not a circle.

import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Cost } from '../../pricing/sell';
import { KEYBOARD_DONE } from '../KeyboardDone';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';

export type CostInput = { mode: 'amount' | 'pulled' | 'unknown'; dollars: string };
export const EMPTY_COST: CostInput = { mode: 'amount', dollars: '' };

/** The sheet's answer as a Cost. An empty amount is no answer (null). */
export function toCost(c: CostInput, packCents: number | null = null): Cost | null {
  if (c.mode === 'pulled') return { kind: 'pulled', packCents };
  if (c.mode === 'unknown') return { kind: 'unknown' };
  const d = parseInt(c.dollars, 10);
  return Number.isFinite(d) ? { kind: 'paid', cents: d * 100 } : null;
}

/** What the vault saves as paidCents from the sheet: a pull costs $0 here (no pack price yet). */
export function paidCentsOf(c: CostInput): number | null {
  if (c.mode === 'pulled') return 0;
  if (c.mode === 'unknown') return null;
  const d = parseInt(c.dollars, 10);
  return Number.isFinite(d) ? d * 100 : null;
}

export function CostField({ value, onChange }: { value: CostInput; onChange: (c: CostInput) => void }) {
  const color = useColors();
  const styles = useStyles();
  const pick = (mode: 'pulled' | 'unknown') => onChange(value.mode === mode ? EMPTY_COST : { mode, dollars: '' });
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flexShrink: 0 }]}>
          What you paid
        </Text>
        <TextInput
          value={value.mode === 'amount' && value.dollars ? `$${value.dollars}` : ''}
          onChangeText={(t) => onChange({ mode: 'amount', dollars: t.replace(/[^0-9]/g, '').slice(0, 6) })}
          placeholder={value.mode === 'pulled' ? 'Pulled' : value.mode === 'unknown' ? 'Not sure' : '$0'}
          placeholderTextColor={color.secondary}
          keyboardType="number-pad"
        inputAccessoryViewID={KEYBOARD_DONE}
          style={[type.rowPrice, styles.input]}
          accessibilityLabel="What you paid"
        />
      </View>
      <View style={styles.chips}>
        <Chip label="Pulled it" on={value.mode === 'pulled'} onPress={() => pick('pulled')} />
        <Chip label="Not sure" on={value.mode === 'unknown'} onPress={() => pick('unknown')} />
      </View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.6 }]}
    >
      <Text style={[type.secondary, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  wrap: { paddingBottom: space.m },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { color: color.ink, textAlign: 'right', width: 140 },
  chips: { flexDirection: 'row', gap: space.s, marginTop: -space.xs },
  // Same size on and off, so nothing moves when one is picked.
  chip: {
    paddingHorizontal: space.m,
    paddingVertical: space.xs + 2,
    borderRadius: radius.button,
    borderWidth: size.hairline,
    borderColor: 'transparent',
    backgroundColor: color.well,
  },
  chipOn: { borderColor: color.ink, backgroundColor: color.canvas },
}));
