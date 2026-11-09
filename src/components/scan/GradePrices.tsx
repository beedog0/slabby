// PSA prices on the scan result: a raw card's sheet leads with its TCGplayer price, and "PSA
// prices ›" opens PSA 10 / 9 / 8 underneath, from eBay sold comps, with how many sales each rests
// on. Fetched only on tap, since the graded lookup spends price credits. Stays in the sheet.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardPrice } from '../../lib/format';
import { gradeLabel, openPrices, TOP_GRADES, type SearchPrices } from '../../services/search';
import type { CardPrice } from '../../services/comps';
import { size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';

/** "8 sales", "Thin · 2 sales", "No sales" for one grade's 30 days. */
export function salesLine(p: CardPrice | null | undefined): string {
  if (!p) return 'No sales yet';
  const n = p.sales30d;
  if (n >= 3) return `${n} sales · 30 days`;
  if (n > 0) return `Thin · ${n} ${n === 1 ? 'sale' : 'sales'}`;
  return 'No sales · 30 days';
}

export function GradePrices({ productId }: { productId: number }) {
  const color = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<SearchPrices | null | undefined>(undefined);

  useEffect(() => {
    setOpen(false);
    setPrices(undefined);
  }, [productId]);

  useEffect(() => {
    if (!open || prices !== undefined) return;
    let live = true;
    openPrices(productId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    return () => {
      live = false;
    };
  }, [open, productId, prices]);

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.toggle}>
        <Text style={[type.text, { color: color.secondary }]}>{open ? 'Hide PSA prices' : 'PSA prices ›'}</Text>
      </Pressable>
      {open ? (
        prices === undefined ? (
          <Text style={[type.text, { color: color.secondary, paddingBottom: space.m }]}>Looking up PSA prices</Text>
        ) : (
          <View style={styles.row}>
            {TOP_GRADES.map((g) => {
              const p = prices?.grades[g] ?? null;
              return (
                <View key={g} style={styles.cell} accessible accessibilityLabel={`${gradeLabel(g)}, ${p ? cardPrice(p.marketCents) : 'no price'}`}>
                  <Text style={[type.secondary, { color: color.secondary }]}>{gradeLabel(g)}</Text>
                  <Text style={[type.rowPrice, { color: color.ink }]}>{p?.marketCents ? cardPrice(p.marketCents) : '—'}</Text>
                  <Text numberOfLines={1} style={[type.caption, { color: color.secondary }]}>{salesLine(p)}</Text>
                </View>
              );
            })}
          </View>
        )
      ) : null}
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  toggle: { minHeight: size.touch, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.m, paddingBottom: space.m },
  cell: { flex: 1, gap: space.xs },
}));
