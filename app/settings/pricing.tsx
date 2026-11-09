// Pricing rules: defaults for every card. Reference: 08-pricing-rules.png.
// Changing a rule recalculates every ask and floor (they're derived), and per-card overrides
// live on the card, so they're kept.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, Hairline, IconButton, Stepper, Toggle } from '../../src/components/ui';
import { money, rulePct } from '../../src/lib/format';
import { useRules } from '../../src/store/rules';
import { color, size, space, type } from '../../src/theme/tokens';
import type { PricingRules } from '../../src/types';

const STEP = 1; // percentage points per tap
const ROUNDING = [100, 500, 1000, 2500]; // $1, $5, $10, $25

export default function PricingRulesScreen() {
  const insets = useSafeAreaInsets();
  const rules = useRules((s) => s.rules);
  const set = useRules((s) => s.set);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const pctRow = (key: keyof PricingRules, title: string, sub: string) => {
    const v = rules[key] as number;
    return (
      <>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: color.ink }]}>{title}</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>{sub}</Text>
          </View>
          <Stepper
            label={title}
            value={rulePct(v)}
            onMinus={() => set({ [key]: v - STEP })}
            onPlus={() => set({ [key]: v + STEP })}
          />
        </View>
        <Hairline />
      </>
    );
  };

  const nextRounding = () => {
    const i = ROUNDING.indexOf(rules.roundToCents);
    set({ roundToCents: ROUNDING[(i + 1) % ROUNDING.length] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={close}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Pricing rules</Text>
        <Pressable accessibilityRole="button" onPress={close} style={styles.done}>
          <Text style={[type.body, { color: color.ink }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl }}>
        <Text style={[type.text, styles.intro]}>
          Defaults for every card. You can override any card on its own screen.
        </Text>

        <Section title="Selling" />
        {pctRow('askPct', 'Ask', 'above market')}
        {pctRow('floorPct', 'Floor', 'below 30-day low sale')}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: color.ink }]}>Never sell at a loss</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>floor can't drop under what you paid</Text>
          </View>
          <Toggle label="Never sell at a loss" value={rules.neverBelowPaid} onChange={(v) => set({ neverBelowPaid: v })} />
        </View>
        <Hairline />

        <Section title="Buying" />
        {pctRow('buyTargetPct', 'Target', 'below market')}
        {pctRow('buyMaxPct', 'Max', 'walk away above')}

        <Section title="Market price" />
        <ValueRow title="Graded cards" value="Median of last 5 eBay sales" />
        <ValueRow title="Raw cards" value="TCGplayer market" />
        <ValueRow title="Round to" value={money(rules.roundToCents)} onPress={nextRounding} />
      </ScrollView>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={{ paddingTop: space.section, paddingBottom: space.m }}>
      <Text style={[type.section, { color: color.ink }]}>{title}</Text>
      <View style={{ paddingTop: space.m }}>
        <Hairline />
      </View>
    </View>
  );
}

function ValueRow({ title, value, onPress }: { title: string; value: string; onPress?: () => void }) {
  return (
    <>
      <Pressable accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress} disabled={!onPress} style={styles.valueRow}>
        <Text style={[type.body, { color: color.ink }]}>{title}</Text>
        <Text style={[type.text, { color: color.secondary }]}>
          {value}
          {onPress ? ' ›' : ''}
        </Text>
      </Pressable>
      <Hairline />
    </>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.gutter - 12,
    paddingRight: space.gutter,
  },
  done: { minHeight: size.touch, justifyContent: 'center' },
  intro: { color: color.secondary, paddingTop: space.s },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingVertical: space.m, gap: space.m },
  valueRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
