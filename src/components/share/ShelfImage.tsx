// A share image of cards standing on wood shelves, 1 to 3 across, like a display case. Used by
// the profile image and the wishlist image. Always light: it's posted. The height follows the
// cards, never shorter than a square, so a few slabs don't float in empty space.

import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { light as color, light, size, space, type } from '../../theme/tokens';
import { PaletteScope } from '../../theme/theme';
import type { Card } from '../../types';
import { Avatar } from '../Avatar';
import { Ledge } from '../collection/ShelfView';
import { SlabView } from '../SlabView';

export const IMG_W = 360;
const GAP = space.l;
const INSET = space.m;
const HEADER_H = 96;
const FOOTER_H = 76;
const ROW_GAP = space.xl;
const CAPTION_H = 40;
/** One big slab still leaves the shelf and margins showing. */
const MAX_SLAB_W = 200;

export type PerRow = 1 | 2 | 3;
export type ShelfItem = { card: Card; /** Under the slab, e.g. "PSA 10" or "Paying $420". */ caption?: string | null };

/** Slab width and image height. Pure, so the layout is tested without drawing. */
export function shelfImageLayout(n: number, perRow: PerRow, captions = false) {
  const inner = IMG_W - space.xl * 2;
  const slabW = Math.min(MAX_SLAB_W, Math.floor((inner - INSET * 2 - GAP * (perRow - 1)) / perRow));
  const slabH = Math.round((slabW * size.heroH) / size.heroW);
  const rows = Math.max(1, Math.ceil(n / perRow));
  const rowH = slabH + size.shelfTop + size.shelfFront + (captions ? CAPTION_H : 0);
  const body = rows * rowH + (rows - 1) * ROW_GAP;
  const height = Math.max(IMG_W, HEADER_H + body + FOOTER_H + space.xl);
  return { slabW, rows, height };
}

type Props = {
  title: string;
  subtitle?: string | null;
  /** A profile photo or its letter beside the title. */
  avatar?: { photo: string | null; letter: string };
  items: ShelfItem[];
  perRow: PerRow;
  footer?: string | null;
};

export const ShelfImage = forwardRef<ComponentRef<typeof View>, Props>(function ShelfImage({ title, subtitle, avatar, items, perRow, footer }, ref) {
  const captions = items.some((i) => i.caption);
  const { slabW, height } = shelfImageLayout(items.length, perRow, captions);
  const shelves: ShelfItem[][] = [];
  for (let i = 0; i < items.length; i += perRow) shelves.push(items.slice(i, i + perRow));

  return (
    <PaletteScope palette={light}>
      <View ref={ref} collapsable={false} style={[styles.canvas, { height }]}>
        <View style={styles.header}>
          {avatar ? <Avatar photo={avatar.photo} letter={avatar.letter} px={48} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.section, { color: color.ink }]}>
              {title}
            </Text>
            {subtitle ? <Text style={[type.secondary, { color: color.secondary }]}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={styles.body}>
          {shelves.map((row, i) => (
            <View key={i}>
              <View style={styles.slabs}>
                {row.map((it) => (
                  <SlabView key={it.card.id} card={it.card} width={slabW} posed={false} anchor="bottom" />
                ))}
              </View>
              <Ledge />
              {captions ? (
                <View style={[styles.captions, { height: CAPTION_H }]}>
                  {row.map((it) => (
                    <Text key={it.card.id} numberOfLines={2} style={[type.caption, styles.caption, { width: slabW }]}>
                      {it.caption ?? ''}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          {footer ? <Text style={[type.secondary, { color: color.ink, textAlign: 'center' }]}>{footer}</Text> : null}
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
  slabs: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: GAP, paddingHorizontal: INSET, marginBottom: -2, zIndex: 1 },
  captions: { flexDirection: 'row', justifyContent: 'center', gap: GAP, paddingHorizontal: INSET, paddingTop: space.s },
  caption: { color: color.ink, textAlign: 'center' },
  footer: { height: FOOTER_H, justifyContent: 'center' },
});
