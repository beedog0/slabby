// What Search shows before you type, so the tab opens onto something instead of a blank page
// (Bryan: the empty tab felt "claustrophobic, trapped"). Everything here is on the phone already,
// so it fills in offline at a con:
//   Recent searches · Recently viewed (card pictures) · Your collection (slabs) · Wishlist.
// A brand-new phone gets a few popular searches instead of recents.

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { showcase } from '../../pricing/profileStats';
import { displayName } from '../../services/search';
import type { Found } from '../../services/searchFilters';
import { useRecent } from '../../store/recent';
import { useWishlist } from '../../store/wishlist';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import { ArtImage } from '../ArtImage';
import { SlabView } from '../SlabView';
import { Hairline } from '../ui';

const POPULAR = ['Charizard', 'Umbreon', 'Pikachu', 'Mew', 'Gengar', 'Rayquaza'];
const STRIP_W = 104;
const COLS = 3;

export function SearchLanding({
  onQuery,
  onOpen,
  vault,
  note,
}: {
  onQuery: (q: string) => void;
  onOpen: (card: Found) => void;
  /** The vault as rows, for "Your collection". */
  vault: CardRow[];
  /** e.g. the catalog still loading. */
  note?: string | null;
}) {
  const color = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const { queries, viewed, clear } = useRecent();
  const wished = useWishlist((s) => s.items);
  const mine = showcase(vault, COLS * 2);
  const cellW = Math.floor((width - space.gutter * 2 - space.m * (COLS - 1)) / COLS);
  const searches = queries.length ? queries : POPULAR;

  return (
    <View style={{ paddingTop: space.l }}>
      <Section title={queries.length ? 'Recent searches' : 'Popular searches'} action={queries.length ? { label: 'Clear', onPress: clear } : undefined}>
        <View style={styles.gutter}>
          {searches.map((q, i) => (
            <View key={q}>
              {i ? <Hairline /> : null}
              <Pressable accessibilityRole="button" onPress={() => onQuery(q)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}>
                <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1 }]}>
                  {q}
                </Text>
                <Text style={[type.text, { color: color.secondary }]}>›</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Section>

      {viewed.length ? (
        <Section title="Recently viewed">
          <Strip
            items={viewed.map((c) => ({ key: String(c.productId), name: displayName(c.name), image: c.imageUrl, onPress: () => onOpen(c) }))}
          />
        </Section>
      ) : null}

      {mine.length ? (
        <Section title="Your collection" action={{ label: 'See all', onPress: () => router.navigate('/') }}>
          <View style={styles.grid}>
            {mine.map((r) => (
              <Pressable key={r.card.id} accessibilityRole="button" accessibilityLabel={r.card.name} onPress={() => router.push(`/card/${r.card.id}`)}>
                <SlabView card={r.card} width={cellW} posed={false} />
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      {wished.length ? (
        <Section title="Wishlist">
          <Strip
            items={wished.map((w) => ({
              key: w.key,
              name: displayName(w.name),
              image: w.imageUrl,
              onPress: () => router.push(`/search/${w.productId}`),
            }))}
          />
        </Section>
      ) : null}

      {note ? <Text style={[type.caption, styles.gutter, { color: color.secondary, paddingTop: space.xl }]}>{note}</Text> : null}
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[type.section, { color: color.ink }]}>{title}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}>
            <Text style={[type.text, { color: color.secondary }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A sideways row of card pictures with the name under each. */
function Strip({ items }: { items: { key: string; name: string; image: string | null; onPress: () => void }[] }) {
  const color = useColors();
  const styles = useStyles();
  const h = Math.round((STRIP_W * 88) / 63);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
      {items.map((it) => (
        <Pressable key={it.key} accessibilityRole="button" onPress={it.onPress} style={({ pressed }) => [{ width: STRIP_W }, pressed && { opacity: 0.85 }]}>
          <View style={[styles.art, { height: h }]}>{it.image ? <ArtImage uri={it.image} recyclingKey={it.key} style={{ flex: 1 }} /> : null}</View>
          <Text numberOfLines={2} style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>
            {it.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    section: { paddingBottom: space.xxl },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: space.gutter,
      paddingBottom: space.m,
    },
    row: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: space.m },
    strip: { paddingHorizontal: space.gutter, gap: space.m },
    art: { width: STRIP_W, borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m, paddingHorizontal: space.gutter },
  }),
);
