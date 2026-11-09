// A raw single in a penny sleeve. TCGplayer scans aren't all 63×88: older sets often come a
// little wider with the whole yellow border, so the sleeve takes the scan's own aspect once it
// loads (remembered per image) and the art is never cropped.

import { useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { shadow } from '../../theme/tokens';
import { useColors, useIsDark } from '../../theme/theme';
import type { Card } from '../../types';
import { ArtImage } from '../ArtImage';

const CARD_ASPECT = 88 / 63; // height / width
const aspects = new Map<string, number>();

/** Height/width of a scan, clamped to sane card shapes so a bad image can't stretch the sleeve. */
export function scanAspect(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return CARD_ASPECT;
  return Math.min(1.5, Math.max(1.25, height / width));
}

export function Sleeve({ card, width, transform, sharp = false }: { card: Card; width: number; transform?: ViewStyle['transform']; sharp?: boolean }) {
  const color = useColors();
  const dark = useIsDark();
  const uri = card.imageFrontUrl;
  const [aspect, setAspect] = useState(() => (uri && aspects.get(uri)) || CARD_ASPECT);
  const w = width * 0.86;
  const r = w * 0.045;
  return (
    <Animated.View
      style={[
        { width: w, height: w * aspect, borderRadius: r, backgroundColor: card.artColor ?? color.well },
        shadow.slabContact,
        transform ? { transform } : null,
      ]}
    >
      {uri ? (
        <ArtImage
          uri={uri}
          label={card.name}
          recyclingKey={card.id}
          sharp={sharp}
          fit="contain"
          onLoad={(e) => {
            const a = scanAspect(e.source.width, e.source.height);
            aspects.set(uri, a);
            if (Math.abs(a - aspect) > 0.005) setAspect(a);
          }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, dark ? styles.sleeveDark : styles.sleeve, { borderRadius: r }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sleeve: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(0,0,0,0.10)', backgroundColor: 'rgba(255,255,255,0.06)' },
  // On black the penny sleeve's edge catches the light instead of casting a line.
  sleeveDark: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.04)' },
});
