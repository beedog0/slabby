// My collection: every card in one list. Filter by All / Holds / For sale / Sold, sorted by value.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../src/components/CardThumb';
import { Segmented } from '../src/components/Segmented';
import { BackIcon, Hairline, IconButton } from '../src/components/ui';
import { gradeLabel, money, pct, rowTitle } from '../src/lib/format';
import { collection, rowFor, type CardRow, type CollectionFilter } from '../src/pricing/portfolio';
import { usePrices } from '../src/store/prices';
import { useRules } from '../src/store/rules';
import { useVault } from '../src/store/vault';
import { color, size, space, type } from '../src/theme/tokens';

const EMPTY: Record<CollectionFilter, string> = {
  all: 'No cards yet. Scan a slab to add one.',
  hold: 'Nothing on hold.',
  sell: 'Nothing listed for sale.',
  sold: 'Nothing sold yet.',
};

export default function Collection() {
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const [filter, setFilter] = useState<CollectionFilter>('all');

  const all = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const list = useMemo(() => collection(all, filter), [all, filter]);
  const count = list.rows.length;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <View style={styles.gutter}>
        <Text style={[type.title, { color: color.ink }]}>Collection</Text>
        <Text style={[type.text, { color: color.secondary, paddingTop: 2 }]}>
          {count} {count === 1 ? 'card' : 'cards'} · {money(list.totalCents)}
          {filter === 'sold' ? ' sold' : ''}
        </Text>
        <Segmented<CollectionFilter>
          style={{ marginTop: space.l, marginBottom: space.s }}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'hold', label: 'Holds' },
            { value: 'sell', label: 'For sale' },
            { value: 'sold', label: 'Sold' },
          ]}
        />
      </View>
      <FlatList
        data={list.rows}
        keyExtractor={(r) => r.card.id}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl }}
        ItemSeparatorComponent={() => <Hairline inset={size.thumbW + 14} />}
        ListEmptyComponent={<Text style={[type.text, { color: color.secondary, paddingTop: space.xxl }]}>{EMPTY[filter]}</Text>}
        renderItem={({ item }) => <Row row={item} />}
      />
    </View>
  );
}

function Row({ row }: { row: CardRow }) {
  const { card, price, gain } = row;
  const sold = card.status === 'sold';
  const tag = sold ? 'Sold' : card.plan === 'sell' ? 'For sale' : card.plan === 'trade' ? 'Trade' : null;
  const soldGain = sold && card.soldCents != null && card.paidCents ? (card.soldCents - card.paidCents) / card.paidCents : null;
  const g = sold ? soldGain : gain;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${card.id}`)} style={styles.row}>
      <CardThumb card={card} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {rowTitle(card)}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {gradeLabel(card.grader, card.grade, card.condition)}
          {tag ? ` · ${tag}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[type.numberM, { color: color.ink }]}>
          {sold ? money(card.soldCents ?? 0) : price ? money(price.marketCents) : '—'}
        </Text>
        {g != null ? <Text style={[type.secondary, { color: g >= 0 ? color.gain : color.loss }]}>{pct(g)}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  row: { height: size.rowVault + 8, flexDirection: 'row', alignItems: 'center', gap: 14 },
});
