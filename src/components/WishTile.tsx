// A wishlist card as a tile: picture, name, grade, market price with its 7-day move, and your
// price under it (green when the market is at or under it). Opens the full card page at that grade,
// where "On your wishlist at $X" edits your price.
// Used on the Search landing and Profile.

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardPrice, money } from '../lib/format';
import { underBy } from '../pricing/wishlistView';
import { displayName, gradeLabel } from '../services/search';
import type { WishItem } from '../store/wishlist';
import { radius, space, type } from '../theme/tokens';
import { themed, useColors } from '../theme/theme';
import { ArtImage } from './ArtImage';
import { ChangeText, cardH, NAME_LINES_H } from './search/CatalogTile';

export function WishTile({ item: w, width }: { item: WishItem; width: number }) {
  const color = useColors();
  const styles = useStyles();
  const under = underBy(w);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${displayName(w.name)}, ${gradeLabel(w.grade)}`}
      onPress={() => router.push({ pathname: '/search/[id]', params: { id: String(w.productId), grade: w.grade } })}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.art, { width, height: cardH(width) }]}>
        <ArtImage uri={w.imageUrl} label={w.name} recyclingKey={w.key} style={{ flex: 1 }} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2} style={[type.secondary, { color: color.ink, fontWeight: '500', minHeight: NAME_LINES_H }]}>
          {displayName(w.name)}
        </Text>
        <Text style={[type.caption, { color: color.secondary }]}>{gradeLabel(w.grade)}</Text>
        <View style={styles.priceLine}>
          <Text style={[type.numberM, { color: w.marketCents != null ? color.ink : color.secondary }]}>
            {w.marketCents != null ? cardPrice(w.marketCents) : 'No price yet'}
          </Text>
          {w.change7d != null ? <ChangeText fraction={w.change7d} style={type.numberM} /> : null}
        </View>
        <Text style={[type.caption, { color: color.secondary }]}>
          {under != null ? (
            <>
              {under ? <Text style={{ color: color.gain }}>{money(under)}</Text> : null}
              {under ? ' under' : 'At'} your {money(w.targetCents)}
            </>
          ) : (
            `You pay ${money(w.targetCents)}`
          )}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    art: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    text: { paddingTop: space.s, gap: space.xs / 2 },
    priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.s, flexWrap: 'wrap' },
  }),
);
