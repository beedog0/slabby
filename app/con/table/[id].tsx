// Before the table. Selling: ask + walk-away. Buying: target + max. Price line, per-card floor
// override. Reference: 07-before-the-table.png.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../../../src/components/CardThumb';
import { PriceLine, type Tick } from '../../../src/components/PriceLine';
import { Segmented } from '../../../src/components/Segmented';
import { BackIcon, Chevron, Hairline, IconButton, PrimaryButton, SlidersIcon, Stepper } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle, rulePct } from '../../../src/lib/format';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { useRules } from '../../../src/store/rules';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

type Mode = 'sell' | 'buy';

export default function BeforeTheTable() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const row = useCardRow(id);
  const rules = useRules((s) => s.rules);
  const update = useVault((s) => s.update);
  const [mode, setMode] = useState<Mode>('sell');

  if (!row) return null;
  const { card, price } = row;
  const step = rules.roundToCents || 100;

  const header = (
    <View style={styles.nav}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon />
      </IconButton>
      <Segmented<Mode>
        style={{ width: 200 }}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'sell', label: 'Selling' },
          { value: 'buy', label: 'Buying' },
        ]}
      />
      <IconButton label="Pricing rules" onPress={() => router.push('/settings/pricing')}>
        <SlidersIcon />
      </IconButton>
    </View>
  );

  const identity = (
    <View style={styles.identity}>
      <CardThumb card={card} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
          {rowTitle(card)}
        </Text>
        <Text style={[type.text, { color: color.secondary }]}>
          {gradeLabel(card.grader, card.grade, card.condition)}
          {price ? ` · market ${money(price.marketCents)}` : ''}
        </Text>
      </View>
    </View>
  );

  if (!price || row.ask == null || row.floor == null || row.buyTarget == null || row.buyMax == null) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        {header}
        {identity}
        <Text style={[type.text, styles.center, { color: color.secondary, paddingTop: space.xxxl }]}>
          No comps yet for this card. Prices fill in when sales come in.
        </Text>
      </View>
    );
  }

  const selling = mode === 'sell';
  const big = selling ? row.ask : row.buyTarget;
  const limit = selling ? row.floor : row.buyMax;

  const ticks: Tick[] = selling
    ? [
        ...(card.paidCents ? [{ value: card.paidCents, label: 'Paid', color: color.ink }] : []),
        { value: row.floor, label: 'Floor', color: color.loss, labelColor: color.loss, height: 14 },
        { value: price.marketCents, label: 'Market', color: color.secondary },
        { value: row.ask, label: 'Ask', color: 'transparent', labelColor: color.ink },
        { value: price.highCents, label: 'High', color: color.hairline },
      ]
    : [
        { value: row.buyTarget, label: 'Target', color: 'transparent', labelColor: color.ink },
        { value: row.buyMax, label: 'Max', color: color.loss, labelColor: color.loss, height: 14 },
        { value: price.marketCents, label: 'Market', color: color.secondary },
        { value: price.highCents, label: 'High', color: color.hairline },
      ];

  const fillFrom = selling ? (card.paidCents ?? row.floor) : row.buyTarget;
  const overridden = card.floorOverrideCents != null;
  const setFloor = (v: number) => update(card.id, { floorOverrideCents: Math.max(0, Math.min(v, row.ask!)) });

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        {identity}

        <View style={[styles.center, { paddingTop: space.xxxl }]}>
          <Text style={[type.text, { color: color.secondary }]}>{selling ? 'Ask for' : 'Open at'}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayXL, { color: color.ink }]}>
            {money(big)}
          </Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
            {selling ? 'Walk away under' : 'Walk away over'}
          </Text>
          <Text style={[type.displayS, { color: color.loss, fontSize: 44 }]}>{money(limit)}</Text>
        </View>

        <View style={styles.gutter}>
          <View style={{ paddingTop: space.xxl, paddingBottom: space.xl }}>
            <PriceLine
              ticks={ticks}
              fill={{ from: fillFrom, to: big, color: color.ink }}
              dot={{ value: big, color: color.ink }}
            />
          </View>
          <Hairline />
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings/pricing')} style={styles.formula}>
            <Text style={[type.text, { color: color.secondary, flex: 1 }]}>
              {selling ? (
                <>
                  Ask = market <Text style={{ color: color.ink, fontWeight: '600' }}>{rulePct(rules.askPct)}</Text> · floor = 30d low{' '}
                  <Text style={{ color: color.ink, fontWeight: '600' }}>{rulePct(rules.floorPct)}</Text>
                </>
              ) : (
                <>
                  Target = market <Text style={{ color: color.ink, fontWeight: '600' }}>{rulePct(rules.buyTargetPct)}</Text> · max = market{' '}
                  <Text style={{ color: color.ink, fontWeight: '600' }}>{rulePct(rules.buyMaxPct)}</Text>
                </>
              )}
            </Text>
            <Chevron />
          </Pressable>
          <Hairline />
          {selling ? (
            <>
              <View style={styles.override}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.text, { color: color.ink }]}>Override for this card</Text>
                  {overridden ? (
                    <Pressable accessibilityRole="button" onPress={() => update(card.id, { floorOverrideCents: null })}>
                      <Text style={[type.secondary, { color: color.secondary }]}>Use the rule again</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Stepper
                  label="floor for this card"
                  value={money(row.floor)}
                  onMinus={() => setFloor(row.floor! - step)}
                  onPlus={() => setFloor(row.floor! + step)}
                />
              </View>
              <Hairline />
            </>
          ) : null}
        </View>
      </ScrollView>

      {selling ? (
        <View style={[styles.gutter, { paddingBottom: insets.bottom + space.l }]}>
          <PrimaryButton title="Got an offer" onPress={() => router.push(`/con/offer/${card.id}`)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.canvas },
  gutter: { paddingHorizontal: space.gutter },
  center: { alignItems: 'center', paddingHorizontal: space.gutter },
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 12,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.l },
  formula: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  override: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m },
});
