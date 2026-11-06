// The scroll-down part of a searched card: prices by grade, where today sits in its 90-day range,
// and more from the same set. Color rule (DESIGN.md): ink and gray for marks, green/red only on
// change numbers. The picked grade is the one ink bar; the others are gray, fainter when the grade has gone quiet.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { money, pct } from '../../lib/format';
import type { CardPrice } from '../../services/comps';
import { displayName, gradeLabel, isQuiet, SEARCH_GRADES, type SearchGrade, type SearchPrices } from '../../services/search';
import type { Found } from '../../services/searchFilters';
import { color, radius, shadow, space, type } from '../../theme/tokens';
import { ArtImage } from '../ArtImage';

type Choice = 'raw' | SearchGrade;

export function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingTop: space.section }}>
      <Text style={[type.section, { color: color.ink }]}>{title}</Text>
      {note ? <Text style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>{note}</Text> : null}
      <View style={{ paddingTop: space.m }}>{children}</View>
    </View>
  );
}

/**
 * Every grade with a price as a bar, longest = priciest. Shows where the money and the sales are
 * at a glance, and taps through to that grade. Grades with no sale in 30 days go gray.
 */
export function GradeLadder({ prices, pick, onPick }: { prices: SearchPrices; pick: Choice; onPick: (c: Choice) => void }) {
  const rows: { key: Choice; p: CardPrice; quiet: boolean }[] = [];
  for (const g of SEARCH_GRADES) {
    const p = prices.grades[g];
    if (p) rows.push({ key: g, p, quiet: isQuiet(p, prices.fetchedAt) });
  }
  if (prices.raw) rows.push({ key: 'raw', p: prices.raw, quiet: false });
  if (rows.length < 2) return null;
  const top = Math.max(...rows.map((r) => r.p.marketCents));

  return (
    <Section title="Prices by grade" note="30-day median · sales in 30 days">
      {rows.map(({ key, p, quiet }) => {
        const on = key === pick;
        const ink = quiet ? color.secondary : color.ink;
        return (
          <Pressable
            key={key}
            onPress={() => onPick(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${gradeLabel(key)} ${money(p.marketCents)}${key === 'raw' ? '' : `, ${p.sales30d} sales`}${quiet ? ', no recent sales' : ''}`}
            style={styles.ladderRow}
          >
            <Text numberOfLines={1} style={[type.text, styles.ladderLabel, { color: ink, fontWeight: on ? '600' : '400' }]}>{gradeLabel(key)}</Text>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.max(2, (p.marketCents / top) * 100)}%`, backgroundColor: on ? color.ink : color.secondary, opacity: on ? 1 : quiet ? 0.15 : 0.3 }]} />
            </View>
            <Text style={[type.text, styles.ladderPrice, { color: ink, fontWeight: on ? '600' : '500' }]}>{money(p.marketCents)}</Text>
            <Text style={[type.secondary, styles.ladderSales, { color: color.secondary }]}>{key === 'raw' ? '' : p.sales30d}</Text>
          </Pressable>
        );
      })}
    </Section>
  );
}

/** Today against its 90-day low and high, drawn like the app's price line: hairline rule, ink dot. */
export function RangeMeter({ low, high, now, days }: { low: number; high: number; now: number; days: number }) {
  if (!(high > low)) return null;
  const at = Math.min(1, Math.max(0, (now - low) / (high - low)));
  const word = at <= 0.2 ? 'Near its low' : at >= 0.8 ? 'Near its high' : 'Mid-range';
  return (
    <Section title={`${days}-day range`} note={`${word} · ${Math.round(at * 100)}% of the way from low to high`}>
      <View style={styles.meter} accessible accessibilityLabel={`Low ${money(low)}, high ${money(high)}, now ${money(now)}`}>
        <View style={styles.rule} />
        <View style={[styles.fill, { width: `${at * 100}%` }]} />
        <View style={[styles.dot, { left: `${at * 100}%` }]} />
      </View>
      <View style={styles.meterLabels}>
        <View>
          <Text style={[type.caption, { color: color.secondary }]}>Low</Text>
          <Text style={[type.text, { color: color.ink, fontWeight: '600' }]}>{money(low)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.caption, { color: color.secondary }]}>High</Text>
          <Text style={[type.text, { color: color.ink, fontWeight: '600' }]}>{money(high)}</Text>
        </View>
      </View>
    </Section>
  );
}

/** The set's priciest other singles, raw TCGplayer market with the 7-day move. */
export function SetRow({ setName, cards }: { setName: string; cards: Found[] }) {
  if (!cards.length) return null;
  return (
    <Section title={`More from ${setName}`} note="Raw TCGplayer market · 7-day change">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={styles.setRow}>
        {cards.map((c) => (
          <Pressable
            key={c.productId}
            onPress={() => router.push(`/search/${c.productId}`)}
            accessibilityRole="button"
            accessibilityLabel={`${displayName(c.name)}, ${c.marketCents != null ? money(c.marketCents) : 'no price'}`}
            style={styles.setCard}
          >
            <View style={[styles.setArt, shadow.thumb]}>
              {c.imageUrl ? <ArtImage uri={c.imageUrl} recyclingKey={String(c.productId)} style={{ flex: 1, borderRadius: radius.thumb * 2 }} /> : null}
            </View>
            <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>
              {displayName(c.name)}
            </Text>
            <Text style={[type.secondary, { color: color.ink, fontWeight: '600' }]}>
              {c.marketCents != null ? money(c.marketCents) : '—'}
              {c.change7d != null && Math.abs(c.change7d) >= 0.005 ? (
                <Text style={{ color: c.change7d > 0 ? color.gain : color.loss, fontWeight: '400' }}> {pct(c.change7d)}</Text>
              ) : null}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Section>
  );
}

const SET_W = 96;

const styles = StyleSheet.create({
  ladderRow: { flexDirection: 'row', alignItems: 'center', height: 40, gap: space.m },
  ladderLabel: { width: 60 },
  track: { flex: 1, height: 6, justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3 },
  ladderPrice: { width: 84, textAlign: 'right' },
  ladderSales: { width: 28, textAlign: 'right' },
  meter: { height: 14, justifyContent: 'center' },
  rule: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: color.hairline },
  fill: { position: 'absolute', left: 0, height: 2, backgroundColor: color.ink },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: color.ink },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.s },
  setRow: { paddingHorizontal: space.gutter, gap: space.l },
  setCard: { width: SET_W },
  setArt: { width: SET_W, height: Math.round(SET_W * (88 / 63)), borderRadius: radius.thumb * 2, backgroundColor: color.well },
});
