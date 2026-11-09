// The share image for a profile: your photo, name and @handle, then your slabs standing on wood
// shelves three across, like your display case, and one line of numbers. Always light: it's posted.
// 3 slabs make a 4:5 post; 6 and 9 grow taller, toward a story.

import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cardLabel, money } from '../../lib/format';
import { asCard, topGradeText, type Showcase } from '../../profile/publicProfile';
import { light as color, light, size, space, type } from '../../theme/tokens';
import { PaletteScope } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Ledge } from '../collection/ShelfView';
import { SlabView } from '../SlabView';
import { initialOf } from '../../store/profile';

export const IMG_W = 360;
const PER_ROW = 3;
const GAP = space.l;
const INSET = space.m;
const HEADER_H = 96;
const FOOTER_H = 76;
const ROW_GAP = space.xl;

/** Slab width and image height for n slabs. Pure, so the layout is tested without drawing. */
export function profileImageLayout(n: number) {
  const inner = IMG_W - space.xl * 2;
  const slabW = Math.floor((inner - INSET * 2 - GAP * (PER_ROW - 1)) / PER_ROW);
  const slabH = Math.round((slabW * size.heroH) / size.heroW);
  const rows = Math.max(1, Math.ceil(n / PER_ROW));
  const rowH = slabH + size.shelfTop + size.shelfFront;
  const body = rows * rowH + (rows - 1) * ROW_GAP;
  const height = Math.max(Math.round((IMG_W * 5) / 4), HEADER_H + body + FOOTER_H + space.xl);
  return { slabW, rows, height };
}

type Props = { name: string; handle: string; photo: string | null; showcase: Showcase; count: number };

export const ProfileImage = forwardRef<ComponentRef<typeof View>, Props>(function ProfileImage({ name, handle, photo, showcase, count }, ref) {
  const cards = showcase.cards.slice(0, count);
  const { slabW, height } = profileImageLayout(cards.length);
  const shelves: typeof cards[] = [];
  for (let i = 0; i < cards.length; i += PER_ROW) shelves.push(cards.slice(i, i + PER_ROW));
  const s = showcase.stats;
  const top = topGradeText(s);
  const line = [
    s.valueCents != null ? money(s.valueCents) : null,
    `${s.owned} ${s.owned === 1 ? 'slab' : 'slabs'}`,
    top ? `${top} top grade` : null,
    `${s.sets} ${s.sets === 1 ? 'set' : 'sets'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const one = cards.length === 1 ? cards[0] : null;

  return (
    <PaletteScope palette={light}>
      <View ref={ref} collapsable={false} style={[styles.canvas, { height }]}>
        <View style={styles.header}>
          <Avatar photo={photo} letter={initialOf(name, handle)} px={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.section, { color: color.ink }]}>
              {name || `@${handle}`}
            </Text>
            {name ? <Text style={[type.secondary, { color: color.secondary }]}>@{handle}</Text> : null}
          </View>
        </View>

        <View style={styles.body}>
          {shelves.map((row, i) => (
            <View key={i}>
              <View style={[styles.slabs, { justifyContent: 'center' }]}>
                {row.map((c) => (
                  <SlabView key={c.id} card={asCard(c)} width={slabW} posed={false} anchor="bottom" />
                ))}
              </View>
              <Ledge />
            </View>
          ))}
          {one ? (
            <Text style={[type.secondary, { color: color.secondary, textAlign: 'center', paddingTop: space.m }]}>
              {cardLabel(asCard(one))}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={[type.secondary, { color: color.ink, textAlign: 'center' }]}>{line}</Text>
          <Text style={[type.caption, { color: color.secondary, textAlign: 'center', paddingTop: space.s }]}>Slabby</Text>
        </View>
      </View>
    </PaletteScope>
  );
});

const styles = StyleSheet.create({
  canvas: { width: IMG_W, backgroundColor: color.canvas, paddingHorizontal: space.xl },
  header: { height: HEADER_H, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingTop: space.l },
  body: { flex: 1, justifyContent: 'center', gap: ROW_GAP },
  slabs: { flexDirection: 'row', alignItems: 'flex-end', gap: GAP, paddingHorizontal: INSET, marginBottom: -2, zIndex: 1 },
  footer: { height: FOOTER_H, justifyContent: 'center' },
});
