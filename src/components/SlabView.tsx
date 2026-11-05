// The slab hero. With the card's photo (TCGplayer art): the PSA label drawn from data above the
// art shown as a 3D card (Card3D). Without one: a drawn PSA-proportion case with the label.
// When the Blender frame-18 render lands (assets/slab/psa/), the case below is swapped for the
// image and the label/photo are composited into its quads with Skia. The props stay the same.

import { StyleSheet, Text, View } from 'react-native';
import { ArtImage } from './ArtImage';
import { color, card3d, radius, shadow, size, slabPose } from '../theme/tokens';
import { Card3D } from './Card3D';
import type { Card } from '../types';

type Props = {
  card: Card;
  width?: number;
  /** Apply the hero pose (rotateY −7°, rotateX +3°). Off for flat uses. */
  posed?: boolean;
  /** Drag to tilt the card (detail screen). */
  interactive?: boolean;
};

const LANG: Record<string, string> = { ja: 'JPN', en: '', ko: 'KOR', zh: 'CHN' };

/** "2023 POKEMON JPN SV2a" */
export function labelSetLine(c: Card): string {
  return [c.year, 'POKEMON', LANG[c.language] ?? c.language.toUpperCase(), c.setCode]
    .filter(Boolean)
    .join(' ');
}

/** "MEW ex #205": species uppercased, suffixes (ex, V, VMAX…) kept as printed. */
export function labelNameLine(c: Card): string {
  const [first, ...rest] = c.name.split(' ');
  const keep = rest.filter((w) => !/^(alt|art|SAR|SIR)$/i.test(w));
  return [first.toUpperCase(), ...keep].join(' ') + (c.number ? ` #${c.number}` : '');
}

const DESCRIPTOR: Record<number, string> = { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM' };

export function SlabView({ card, width = size.heroW, posed = true, interactive = false }: Props) {
  const k = width / size.heroW; // scale everything from the 190 pt hero
  const height = (width * size.heroH) / size.heroW;
  const isTen = card.grader === 'psa' && card.grade === 10;

  if (card.grader === 'raw') {
    // Raw cards: penny sleeve at the same card scale, no slab.
    return (
      <View
        style={[
          { width: width * 0.86, height: width * 0.86 * 1.4, borderRadius: 6 * k, backgroundColor: card.artColor ?? color.well },
          shadow.slabContact,
          posed && pose,
        ]}
        accessibilityLabel={`${card.name}, raw`}
      >
        {card.imageFrontUrl ? (
          <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} style={[StyleSheet.absoluteFill, { borderRadius: 6 * k }]}
          />
        ) : null}
      </View>
    );
  }

  const label = (
    <View style={[styles.label, { height: 52 * k, borderRadius: 3 * k, paddingHorizontal: 10 * k }]}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.labelText, { fontSize: 9 * k }]}>
          {labelSetLine(card)}
        </Text>
        <Text numberOfLines={1} style={[styles.labelText, { fontSize: 9 * k, fontWeight: '600' }]}>
          {labelNameLine(card)}
        </Text>
        {card.certNumber && k > 0.75 ? (
          <Text style={[styles.labelText, { fontSize: 7 * k, opacity: 0.55 }]}>{card.certNumber}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {card.grade != null && DESCRIPTOR[card.grade] ? (
          <Text style={[styles.labelText, { fontSize: 6 * k }]}>{DESCRIPTOR[card.grade]}</Text>
        ) : null}
        <Text style={[styles.grade, { fontSize: 16 * k, color: isTen ? color.psaRed : color.ink }]}>{card.grade}</Text>
      </View>
    </View>
  );

  if (card.imageFrontUrl) {
    // Same footprint as the drawn slab so shelves and grids keep their rhythm.
    const gap = 8 * k;
    const cardW = Math.min(width, (height - 52 * k - gap) / card3d.aspect);
    return (
      <View
        style={{ width, height, alignItems: 'center', gap }}
        accessibilityLabel={`${card.name}, ${card.grader.toUpperCase()} ${card.grade}`}
      >
        <View style={[{ width: cardW }, posed && pose]}>{label}</View>
        <Card3D uri={card.imageFrontUrl} width={cardW} posed={posed} interactive={interactive} />
      </View>
    );
  }

  return (
    <View
      style={[{ width, height }, posed && pose, posed && shadow.slabAmbient]}
      accessibilityLabel={`${card.name}, ${card.grader.toUpperCase()} ${card.grade}`}
    >
      <View style={[styles.case, { borderRadius: radius.slab * k, padding: 10 * k }, shadow.slabContact]}>
        {label}
        <View
          style={{
            flex: 1,
            marginTop: 8 * k,
            borderRadius: 4 * k,
            overflow: 'hidden',
            backgroundColor: card.artColor ?? color.well,
          }}
        >
          {card.imageFrontUrl ? (
            <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} style={StyleSheet.absoluteFill} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const pose = {
  transform: [
    { perspective: slabPose.perspective },
    { rotateY: slabPose.rotateY },
    { rotateX: slabPose.rotateX },
  ],
};

const styles = StyleSheet.create({
  case: {
    flex: 1,
    backgroundColor: color.slabCase,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  label: {
    backgroundColor: color.slabLabel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelText: { color: color.ink, fontWeight: '500', lineHeight: undefined },
  grade: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
