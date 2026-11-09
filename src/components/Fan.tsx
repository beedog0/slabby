// Up to three card pictures fanned left to right, each tucked under the last: the Wishlist row on
// Profile.

import { StyleSheet, View } from 'react-native';
import { radius, size } from '../theme/tokens';
import { themed } from '../theme/theme';
import { ArtImage } from './ArtImage';

/** Up to three card pictures fanned left to right, each tucked under the last. */
export function Fan({ images }: { images: { key: string; uri: string | null; label: string }[] }) {
  const styles = useStyles();
  return (
    <View style={{ width: size.thumbW + (images.length - 1) * (size.thumbW / 2), height: size.thumbH }}>
      {images.map((im, i) => (
        <View key={im.key} style={[styles.fanCard, { left: i * (size.thumbW / 2), zIndex: images.length - i }]}>
          <ArtImage uri={im.uri} label={im.label} recyclingKey={im.key} style={{ flex: 1 }} />
        </View>
      ))}
    </View>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    fanCard: {
      position: 'absolute',
      top: 0,
      width: size.thumbW,
      height: size.thumbH,
      borderRadius: radius.thumb,
      overflow: 'hidden',
      backgroundColor: color.well,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: color.canvas,
    },
  }),
);
