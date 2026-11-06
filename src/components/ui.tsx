// Small shared primitives. All values come from tokens.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, radius, size, space, type } from '../theme/tokens';

export function PrimaryButton({ title, onPress, style }: { title: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }, style]}
    >
      <Text style={[type.button, { color: color.onInk }]}>{title}</Text>
    </Pressable>
  );
}

/** Inset hairline: starts at the text edge, never full-bleed. */
export function Hairline({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.hairline, marginLeft: inset }} />;
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[type.section, { color: color.ink }]}>{title}</Text>
      {right}
    </View>
  );
}

export function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={{ width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Pressable>
  );
}

export function ScanIcon({ s = 24 }: { s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={1.75} strokeLinecap="round">
      <Path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    </Svg>
  );
}

export function PlusIcon({ s = 24 }: { s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={1.75} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function Chevron() {
  return <Text style={[type.text, { color: color.secondary }]}> ›</Text>;
}

/** − value + stepper, used for rule percentages and per-card overrides. */
export function Stepper({
  value,
  onMinus,
  onPlus,
  label,
  minusDisabled,
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  label: string;
  /** At the lowest allowed value: the − glyph goes secondary and does nothing. */
  minusDisabled?: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <StepButton glyph={'−'} onPress={onMinus} label={`Decrease ${label}`} disabled={minusDisabled} />
      <Text style={[type.rowPrice, styles.stepValue]}>{value}</Text>
      <StepButton glyph="+" onPress={onPlus} label={`Increase ${label}`} />
    </View>
  );
}

function StepButton({ glyph, onPress, label, disabled }: { glyph: string; onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.stepBtn}
    >
      <Text style={[type.numberM, { color: disabled ? color.secondary : color.ink }]}>{glyph}</Text>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: color.ink, false: color.hairline }}
      thumbColor={color.canvas}
      ios_backgroundColor={color.hairline}
    />
  );
}

const styles = StyleSheet.create({
  primary: {
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: space.m,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  stepBtn: {
    width: size.touch,
    height: size.touch,
    borderRadius: size.touch / 2,
    backgroundColor: color.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 72, textAlign: 'center', color: color.ink },
});

export function SlidersIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={1.75} strokeLinecap="round">
      <Path d="M4 8h9M19 8h1M4 16h1M11 16h9" />
      <Path d="M16 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </Svg>
  );
}
