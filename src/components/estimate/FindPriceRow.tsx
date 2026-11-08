// One quiet row for a card and grade with no real price, on the search card page and in con
// mode's "They're asking": "Find a price" searches recent sold listings (eBay first) and the
// answer shows as "Estimate · from N sales found online" with the median; a tap lists every sale
// with its link. Never presented as a comp. Same search, cache and daily cap as the vault card
// page's NoPriceSource.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { money, shortDay } from '../../lib/format';
import { estimateLine } from '../../pricing/estimate';
import { estimateEntry, findPrice, useFallbackPrice, type FindResult } from '../../services/estimate';
import { space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { Chevron } from '../ui';
import { openEstimateSales } from './NoPriceSource';

const FAILED: Partial<Record<FindResult, string>> = {
  capped: 'Today’s searches are used up. Try again tomorrow.',
  offline: 'Can’t search without a connection.',
  error: 'Couldn’t search right now. Try again in a minute.',
};

export function FindPriceRow({ card }: { card: Card }) {
  const color = useColors();
  const styles = useStyles();
  const fallback = useFallbackPrice(card);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FindResult | null>(null);
  const estimate = fallback?.estimate;
  const entry = estimateEntry(card);

  if (estimate) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Shows the sales it came from"
        onPress={() => openEstimateSales(estimate)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
      >
        <View style={styles.line}>
          <Text style={[type.text, styles.label]}>{estimateLine(estimate.sales.length)}</Text>
          <View style={styles.link}>
            <Text style={[type.text, styles.num]}>{money(estimate.priceCents)}</Text>
            <Chevron />
          </View>
        </View>
        <Text style={[type.secondary, styles.sub]}>Median of the sales found · not a comp · searched {shortDay(estimate.foundAt.slice(0, 10))}</Text>
      </Pressable>
    );
  }

  if (entry?.kind === 'none') {
    return (
      <View style={styles.row}>
        <Text style={[type.text, styles.sub]}>No sales found online. Searched {shortDay(entry.foundAt.slice(0, 10))}.</Text>
      </View>
    );
  }

  const find = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    const r = await findPrice(card);
    setBusy(false);
    if (r !== 'found' && r !== 'none') setFailed(r);
  };

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={find} style={({ pressed }) => [styles.find, pressed && { opacity: 0.5 }]}>
        <Text style={[type.body, { color: color.ink }]}>{busy ? 'Searching eBay sold listings…' : 'Find a price from eBay sales'}</Text>
      </Pressable>
      <Text style={[type.secondary, styles.sub, { textAlign: 'center' }]}>
        {failed ? FAILED[failed] : busy ? 'This takes about half a minute.' : ''}
      </Text>
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  row: { paddingVertical: space.m },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m },
  label: { color: color.ink, flexShrink: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  num: { color: color.ink, fontVariant: ['tabular-nums'] },
  sub: { color: color.secondary, paddingTop: space.xs },
  find: { alignItems: 'center', paddingVertical: space.s },
}));
