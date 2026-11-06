// Before the table. Selling: ask + walk-away. Buying: target + max. Price line with a price on
// every marker, per-card floor override (never under paid while "never sell at a loss" is on).
// A sold card shows the sale with undo instead. Reference: 07-before-the-table.png.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../../../src/components/CardThumb';
import { PriceLine, type Tick } from '../../../src/components/PriceLine';
import { Segmented } from '../../../src/components/Segmented';
import { SoldState } from '../../../src/components/SoldState';
import { TrendSentence } from '../../../src/components/TrendSentence';
import { BackIcon, Chevron, Hairline, IconButton, PrimaryButton, SlidersIcon, Stepper } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle, rulePct } from '../../../src/lib/format';
import { minFloorOverride } from '../../../src/pricing/rules';
import { freshnessLine, freshnessWorthShowing, trendSentence, trendVerdict } from '../../../src/pricing/trend';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { useCardRefresh } from '../../../src/services/useRefresh';
import { useCon, type ConMode } from '../../../src/store/con';
import { useRules } from '../../../src/store/rules';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

type Mode = ConMode;

export default function BeforeTheTable() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const row = useCardRow(id);
  const rules = useRules((s) => s.rules);
  const update = useVault((s) => s.update);
  // Starts on con mode's side; flipping here is a quick look and never changes con mode.
  const [mode, setMode] = useState<Mode>(useCon.getState().mode);
  const refresh = useCardRefresh(row?.card);

  if (!row) return null;
  const { card, price } = row;
  // Only when it matters here: behind, or the update failed. Never "Updating…": the pull spinner
  // says it, and a line that comes and goes would make the screen jump.
  const refreshState = refresh.state === 'failed' ? 'failed' : 'idle';
  const fresh =
    price && freshnessWorthShowing(price, refreshState) ? freshnessLine(price, { raw: card.grader === 'raw', state: refreshState }) : null;
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
        {fresh && card.status !== 'sold' ? (
          <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
            {fresh}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (card.status === 'sold') {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>
        {identity}
        <SoldState row={row} bottomInset={insets.bottom} />
      </View>
    );
  }

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

  // High comp lives on Slab detail; here the line is only the numbers you act on.
  const ticks: Tick[] = selling
    ? [
        ...(card.paidCents ? [{ value: card.paidCents, label: 'Paid', color: color.ink }] : []),
        { value: row.floor, label: 'Floor', color: color.loss, labelColor: color.loss, height: 14 },
        { value: price.marketCents, label: 'Market', color: color.secondary },
        { value: row.ask, label: 'Ask', color: 'transparent', labelColor: color.ink, pin: true },
      ]
    : [
        { value: row.buyTarget, label: 'Target', color: 'transparent', labelColor: color.ink, pin: true },
        { value: row.buyMax, label: 'Max', color: color.loss, labelColor: color.loss, height: 14 },
        { value: price.marketCents, label: 'Market', color: color.secondary },
      ];

  const fillFrom = selling ? (card.paidCents ?? row.floor) : row.buyTarget;
  const fillTo = selling ? big : row.buyMax;
  const overridden = card.floorOverrideCents != null;
  const minFloor = minFloorOverride({ paidCents: card.paidCents, rules });
  const atMin = row.floor <= minFloor;
  const setFloor = (v: number) => update(card.id, { floorOverrideCents: Math.max(minFloor, Math.min(v, row.ask!)) });
  const raw = card.grader === 'raw';
  const em = (s: string) => <Text style={{ color: color.ink, fontWeight: '600' }}>{s}</Text>;
  const floorWhy =
    row.floorBasis === 'override' ? (
      <>floor set for this card</>
    ) : row.floorBasis === 'paid' ? (
      <>floor = what you paid</>
    ) : row.floorBasis === 'ask' ? (
      <>floor = ask</>
    ) : (
      <>
        floor = {raw ? 'low' : '30d low'} {em(rulePct(rules.floorPct))}
      </>
    );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {header}
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.pull} tintColor={color.secondary} />}
      >
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
              fill={{ from: fillFrom, to: fillTo, color: color.ink }}
              dot={{ value: big, color: color.ink }}
              reserveAbove
            />
          </View>
          <Hairline />
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings/pricing')} style={styles.formula}>
            <Text style={[type.text, { color: color.secondary, flex: 1 }]}>
              {selling ? (
                <>
                  Ask = {raw ? 'TCGplayer' : 'market'} {em(rulePct(rules.askPct))} · {floorWhy}
                </>
              ) : (
                <>
                  Target = {raw ? 'TCGplayer' : 'market'} {em(rulePct(rules.buyTargetPct))} · max = {raw ? 'TCGplayer' : 'market'}{' '}
                  {em(rulePct(rules.buyMaxPct))}
                </>
              )}
            </Text>
            <Chevron />
          </Pressable>
          <Hairline />
          {!selling ? (
            <>
              <View style={styles.trend}>
                <TrendSentence parts={trendSentence(trendVerdict(price, 30, { raw }), 30, raw, { window: true })} />
              </View>
              <Hairline />
            </>
          ) : null}
          {selling ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`What you paid, ${card.paidCents != null ? money(card.paidCents) : "don't know"}`}
                onPress={() => router.push(`/con/paid/${card.id}`)}
                style={({ pressed }) => [styles.override, pressed && { opacity: 0.5 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.text, { color: color.ink }]}>What you paid</Text>
                  {card.paidCents == null && rules.neverBelowPaid ? (
                    <Text style={[type.secondary, { color: color.secondary }]}>Add it to keep the floor above it</Text>
                  ) : null}
                </View>
                <Text style={[type.body, { color: card.paidCents != null ? color.ink : color.secondary }]}>
                  {card.paidCents != null ? money(card.paidCents) : "Don't know"}
                </Text>
                <Chevron />
              </Pressable>
              <Hairline />
              <View style={styles.override}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.text, { color: color.ink }]}>Override for this card</Text>
                  {atMin && minFloor > 0 ? (
                    <Text style={[type.secondary, { color: color.secondary }]}>Can't go under what you paid</Text>
                  ) : null}
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
                  minusDisabled={atMin}
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
  trend: { minHeight: 56, justifyContent: 'center' },
  override: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m },
});
