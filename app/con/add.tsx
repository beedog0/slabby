// Con quick add, "From my collection": pick a slab from the vault, then mark it For sale,
// Trade only or Sold on the themed sheet. Holds come first; they're what you'd bring to a table.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../../src/components/CardThumb';
import { openConStatusMenu } from '../../src/components/conStatusMenu';
import { BackIcon, Hairline, IconButton } from '../../src/components/ui';
import { CON_STATUS_LABEL, conStatusOf } from '../../src/lib/conStatus';
import { gradeLabel, money, rowTitle } from '../../src/lib/format';
import { rowFor } from '../../src/pricing/portfolio';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { color, radius, size, space, type } from '../../src/theme/tokens';

const ORDER = { hold: 0, sale: 1, trade: 2, sold: 3 } as const;

export default function AddFromCollection() {
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards
      .filter((c) => c.status === 'owned')
      .filter((c) => !needle || `${c.name} ${c.setName ?? ''} ${c.certNumber ?? ''}`.toLowerCase().includes(needle))
      .map((c) => rowFor(c, rules))
      .sort((a, b) => ORDER[conStatusOf(a.card)] - ORDER[conStatusOf(b.card)]);
  }, [cards, rules, prices, q]);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Add which slab?</Text>
        <View style={{ width: size.touch }} />
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search your collection"
        placeholderTextColor={color.secondary}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel="Search your collection"
        style={[type.text, styles.search]}
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: insets.bottom + space.xxl }}
      >
        {rows.map((r) => {
          const s = conStatusOf(r.card);
          return (
            <View key={r.card.id}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openConStatusMenu(r.card)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <CardThumb card={r.card} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
                    {rowTitle(r.card)}
                  </Text>
                  <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                    {gradeLabel(r.card.grader, r.card.grade, r.card.condition)} · {CON_STATUS_LABEL[s]}
                  </Text>
                </View>
                <Text style={[type.numberM, { color: color.ink }]}>{r.price ? money(r.price.marketCents) : '—'}</Text>
              </Pressable>
              <Hairline inset={size.thumbW + space.m} />
            </View>
          );
        })}
        {rows.length === 0 ? (
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
            {q ? 'Nothing in your collection matches.' : 'Your collection is empty. Scan a slab to add one.'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 12,
  },
  search: {
    height: size.touch,
    marginHorizontal: space.gutter,
    paddingHorizontal: space.m,
    borderRadius: radius.field,
    backgroundColor: color.well,
    color: color.ink,
  },
  row: { height: size.rowVault, flexDirection: 'row', alignItems: 'center', gap: space.m },
});
