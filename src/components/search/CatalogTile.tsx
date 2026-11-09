// Catalog pieces for the Search landing: a picture tile (card art or a sealed box standing on the
// canvas), a percent change colored only on the number, and a set row.

import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { cardPrice, langTag, pct, pctSign } from '../../lib/format';
import { sealedLabel } from '../../lib/sealed';
import { displayName } from '../../services/search';
import type { Found } from '../../services/searchFilters';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import { ArtImage } from '../ArtImage';
import { MiniChart } from '../MiniChart';
import { Sparkline } from '../Sparkline';

/** Card art height for a width: TCGplayer card scans are 63 × 88. */
export const cardH = (w: number) => Math.round((w * 88) / 63);

/** Two lines of a tile's name, held even when the name fits on one, so prices line up across a row. */
export const NAME_LINES_H = Math.round(type.secondary.fontSize * 1.3) * 2;

/** "+18%" in gain, "−7%" in loss, "0%" in gray. */
export function ChangeText({ fraction, suffix, style }: { fraction: number; suffix?: string; style?: TextStyle | TextStyle[] }) {
  const color = useColors();
  const s = pctSign(fraction);
  return (
    <Text style={[type.secondary, style as TextStyle, { color: s > 0 ? color.gain : s < 0 ? color.loss : color.secondary }]}>
      {pct(fraction)}
      {suffix ? <Text style={{ color: color.secondary }}>{suffix}</Text> : null}
    </Text>
  );
}

/** The picture, name on up to two lines, then the market price and (when given) its move. */
export function CatalogTile({
  item,
  width,
  onPress,
  change,
  hist,
}: {
  item: Found;
  width: number;
  onPress: () => void;
  change?: number | null;
  /** Recent nightly prices, oldest first, for the small price line. */
  hist?: number[];
}) {
  const color = useColors();
  const styles = useStyles();
  const sealed = item.sealedType;
  const tag = langTag(item.language);
  const name = sealed ? item.name : displayName(item.name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}
    >
      <View style={[sealed ? styles.sealed : styles.art, { width, height: cardH(width) }]}>
        <ArtImage
          uri={item.imageUrl}
          label={item.name}
          recyclingKey={String(item.productId)}
          fit={sealed ? 'contain' : 'cover'}
          position={sealed ? 'bottom' : undefined}
          style={{ flex: 1 }}
        />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2} style={[type.secondary, { color: color.ink, fontWeight: '500', minHeight: NAME_LINES_H }]}>
          {name}
          {tag ? <Text style={{ color: color.secondary }}>{`  ${tag}`}</Text> : null}
        </Text>
        {/* What is moving: a card's raw (ungraded) TCGplayer market, or the sealed product's. */}
        <Text style={[type.caption, { color: color.secondary }]}>{sealed ? sealedLabel(sealed) : 'Raw · TCGplayer'}</Text>
        <View style={styles.priceRow}>
          <View style={styles.priceLine}>
            <Text style={[type.numberM, { color: item.marketCents != null ? color.ink : color.secondary }]}>
              {item.marketCents != null ? cardPrice(item.marketCents) : '—'}
            </Text>
            {change != null ? <ChangeText fraction={change} style={type.secondary} /> : null}
          </View>
          {hist && hist.length >= 3 && width >= size.sparkW * 3 ? <Sparkline values={hist} change={change ?? 0} /> : null}
        </View>
        {hist && hist.length >= 3 && width < size.sparkW * 3 ? <MiniChart values={hist} width={width} height={size.sparkH} /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    art: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
    sealed: { overflow: 'hidden' },
    text: { paddingTop: space.s, gap: space.xs / 2 },
    priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
    priceLine: { flex: 1, flexDirection: 'row', alignItems: 'baseline', columnGap: space.s, flexWrap: 'wrap' },
  }),
);
