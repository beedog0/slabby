// Vault: slab hero, vault value, "Start con mode", holds list. Reference: 01-vault.png.

import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../src/components/CardThumb';
import { SlabView } from '../src/components/SlabView';
import { Chevron, Hairline, IconButton, PrimaryButton, ScanIcon, SectionHeader } from '../src/components/ui';
import { gradeLabel, money, monthLine, pct, rowTitle } from '../src/lib/format';
import { rowFor, summarize, type CardRow } from '../src/pricing/portfolio';
import { refreshPrices } from '../src/services/comps';
import { usePrices } from '../src/store/prices';
import { useRules } from '../src/store/rules';
import { useVault } from '../src/store/vault';
import { color, size, space, type } from '../src/theme/tokens';

export default function Vault() {
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);

  const prices = usePrices((s) => s.byKey);
  useEffect(() => {
    refreshPrices(cards);
  }, [cards]);

  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const holds = rows.filter((r) => r.card.status === 'owned' && r.card.plan === 'hold');
  const hero = useMemo(
    () =>
      rows
        .filter((r) => r.card.status === 'owned' && r.card.grader !== 'raw')
        .sort((a, b) => (b.price?.marketCents ?? 0) - (a.price?.marketCents ?? 0))[0]?.card,
    [rows],
  );

  return (
    <ScrollView
      style={{ backgroundColor: color.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl }}
    >
      <View style={styles.header}>
        <Text style={[type.section, { color: color.ink }]}>Slabby</Text>
        <IconButton label="Scan a slab" onPress={() => router.push('/scan')}>
          <ScanIcon />
        </IconButton>
      </View>

      <View style={styles.hero}>{hero ? <SlabView card={hero} /> : null}</View>

      <View style={styles.value}>
        <Text style={[type.displayM, { color: color.ink }]}>{money(summary.valueCents)}</Text>
        <Text style={[type.text, { color: color.secondary }]}>{monthLine(summary.monthDeltaCents)}</Text>
      </View>

      <View style={styles.gutter}>
        <PrimaryButton title="Start con mode" onPress={() => router.push('/con')} />
      </View>

      <View style={[styles.gutter, { paddingTop: space.section }]}>
        <SectionHeader
          title="Holds"
          right={<Text style={[type.text, { color: color.secondary }]}>{summary.forSaleCount} listed</Text>}
        />
        {holds.map((r) => (
          <View key={r.card.id}>
            <HoldRow row={r} />
            <Hairline inset={size.thumbW + 14} />
          </View>
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/settings/pricing')}
          style={styles.quietLink}
        >
          <Text style={[type.text, { color: color.secondary }]}>
            Pricing rules
            <Chevron />
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function HoldRow({ row }: { row: CardRow }) {
  const { card, price, gain } = row;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/card/${card.id}`)}
      style={styles.row}
    >
      <CardThumb card={card} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {rowTitle(card)}
        </Text>
        <Text style={[type.secondary, { color: color.secondary }]}>
          {gradeLabel(card.grader, card.grade, card.condition)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[type.numberM, { color: color.ink }]}>{price ? money(price.marketCents) : '—'}</Text>
        {gain != null ? (
          <Text style={[type.secondary, { color: gain >= 0 ? color.gain : color.loss }]}>{pct(gain)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: space.gutter,
    paddingRight: space.gutter - 10,
  },
  hero: { height: 330, alignItems: 'center', justifyContent: 'center' },
  value: { alignItems: 'center', gap: 6, paddingHorizontal: space.gutter, paddingBottom: space.xl + 4 },
  row: { height: size.rowVault + 8, flexDirection: 'row', alignItems: 'center', gap: 14 },
  quietLink: { paddingVertical: space.l, minHeight: size.touch, justifyContent: 'center' },
});
