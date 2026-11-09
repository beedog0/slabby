// Import review: the card picker inside a row's sheet. Lists catalog cards that could be the row
// (same name, or the row's set and number), each with its picture, set and number so similar
// printings can be told apart. Tapping one closes the sheet and uses it.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { cardNumber, displayName, type CatalogCard } from '../../services/search';
import { candidates } from '../../services/importMatch';
import type { ImportRow } from '../../services/importCsv';
import { langTag } from '../../lib/format';
import { color, radius, size, space, type } from '../../theme/tokens';
import { ArtImage } from '../ArtImage';
import { closeMenu } from '../menu/Menu';
import { SheetScrollView } from '../sheet/useSheetDrag';
import { Hairline } from '../ui';

export function PickCard({ row, current, onPick }: { row: ImportRow; current: number | null; onPick: (c: CatalogCard) => void }) {
  const { height } = useWindowDimensions();
  const [list, setList] = useState<CatalogCard[] | null>(null);

  useEffect(() => {
    let live = true;
    candidates(row)
      .then((c) => live && setList(c))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [row]);

  if (!list)
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={color.secondary} />
      </View>
    );
  if (!list.length)
    return (
      <Text style={[type.text, styles.note]}>
        {row.language && row.language !== 'en' && row.language !== 'ja'
          ? 'Our catalog has English and Japanese cards only, so this one comes in as written, with no price.'
          : 'No card in our catalog looks like this one. It comes in as written.'}
      </Text>
    );
  return (
    <SheetScrollView style={{ maxHeight: height * 0.5 }}>
      {list.map((c, i) => (
        <View key={c.productId}>
          {i > 0 ? <Hairline inset={size.thumbW + space.m} /> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => closeMenu(() => onPick(c))}
            style={({ pressed }) => [styles.row, c.productId === current && styles.current, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.thumb}>{c.imageUrl ? <ArtImage uri={c.imageUrl} style={{ flex: 1 }} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: color.ink }]}>{displayName(c.name)}</Text>
              <Text style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>
                {[c.setName, c.number ? `#${cardNumber(c.number)}` : null, langTag(c.language)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Pressable>
        </View>
      ))}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: space.xl, alignItems: 'center' },
  note: { color: color.secondary, paddingVertical: space.l },
  // The menu sheet already sets the side margins.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  // The current pick: an outline, not a check circle.
  current: { borderWidth: 1.5, borderColor: color.ink, borderRadius: radius.field, paddingHorizontal: space.s },
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: color.well, overflow: 'hidden' },
});
