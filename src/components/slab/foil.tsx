// Foil on the card: a soft rainbow sheen and a light sweep that move as the slab turns,
// laid only where the real card is foil. Holo: the art window. Reverse holo: everything but
// the art window. Full art (SAR, SIR, alt art, gold, rainbow): the whole card.
// Plain views and one gradient each, no images, so it costs nothing on the grid.

import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Card } from '../../types';
import type { SlabLayout } from './geometry';

export type Foil = 'holo' | 'reverse' | 'fullart';

/** The art window of a standard Pokémon card, as shares of the card (from a scan). */
const ART = { x: 0.08, y: 0.105, w: 0.84, h: 0.43 } as const;

const FULL_ART = /\b(SPECIAL ART|ILLUSTRATION RARE|FULL ART|ALT(ERNATE)? ART|SECRET|GOLD|HYPER|RAINBOW|SAR|SIR|UR|HR|SR|CHR|CSR|TRAINER GALLERY)\b/i;
const HOLO_SUFFIX = /\b(ex|EX|GX|V|VMAX|VSTAR|LV\.X|BREAK|Prime|LEGEND)$/;

/**
 * Which part of the card is foil. Uses the card's own finish when the print picker set one,
 * then PSA's variety line, then the name: full-art rarities, then holo rule boxes (ex, V…).
 * Anything we can't tell stays flat; no sheen beats a wrong one.
 */
export function foilOf(card: Card & { finish?: Foil | null; variety?: string | null }): Foil | null {
  if (card.finish !== undefined) return card.finish;
  const variety = card.variety ?? '';
  if (/REVERSE/i.test(variety)) return 'reverse';
  if (FULL_ART.test(variety) || FULL_ART.test(card.name)) return 'fullart';
  if (/HOLO/i.test(variety) || HOLO_SUFFIX.test(card.name.trim())) return 'holo';
  return null;
}

type Box = { left: number; top: number; width: number; height: number };

function masks(kind: Foil, L: SlabLayout): Box[] {
  const c = L.card;
  const art: Box = { left: c.x + c.w * ART.x, top: c.y + c.h * ART.y, width: c.w * ART.w, height: c.h * ART.h };
  if (kind === 'holo') return [art];
  const whole: Box = { left: c.x, top: c.y, width: c.w, height: c.h };
  if (kind === 'fullart') return [whole];
  // Reverse holo: the card minus the art window, as four strips.
  return [
    { left: c.x, top: c.y, width: c.w, height: art.top - c.y },
    { left: c.x, top: art.top + art.height, width: c.w, height: c.y + c.h - art.top - art.height },
    { left: c.x, top: art.top, width: art.left - c.x, height: art.height },
    { left: art.left + art.width, top: art.top, width: c.x + c.w - art.left - art.width, height: art.height },
  ];
}

const RAINBOW = ['rgba(255,80,160,0)', 'rgba(255,90,170,0.55)', 'rgba(255,214,90,0.55)', 'rgba(90,230,170,0.55)', 'rgba(80,170,255,0.55)', 'rgba(180,110,255,0.55)', 'rgba(180,110,255,0)'] as const;

/**
 * The sheen for one pose. `s`/`sa` are sin(yaw)/sin(pitch): the bands slide with the turn,
 * and get brighter the further the card is tilted, like foil catching the light.
 */
export const FoilSheen = memo(function FoilSheen({ kind, L, s, sa }: { kind: Foil; L: SlabLayout; s: number; sa: number }) {
  const tilt = Math.min(1, Math.hypot(s, sa) * 2.2);
  const rainbow = 0.12 + 0.3 * tilt;
  const sweep = 0.06 + 0.3 * tilt;
  const shift = (s * 1.4 + sa * 0.8) * L.card.w;
  const r = L.card.r;
  return (
    <>
      {masks(kind, L).map((m, i) =>
        m.width > 0.5 && m.height > 0.5 ? (
          <View key={i} pointerEvents="none" style={[styles.abs, m, { overflow: 'hidden', borderRadius: kind === 'fullart' ? r : kind === 'holo' ? r * 0.2 : 0 }]}>
            <View style={[styles.abs, { left: -m.left + L.card.x - L.card.w, top: -m.top + L.card.y - L.card.h * 0.5, width: L.card.w * 3, height: L.card.h * 2, opacity: rainbow, transform: [{ translateX: shift }, { rotate: '-30deg' }] }]}>
              <LinearGradient colors={RAINBOW} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </View>
            <View style={[styles.abs, { left: -m.left + L.card.x - L.card.w * 0.5, top: -m.top + L.card.y - L.card.h * 0.5, width: L.card.w * 2, height: L.card.h * 2, opacity: sweep, transform: [{ translateX: shift * 1.6 }, { rotate: '-30deg' }] }]}>
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                locations={[0.38, 0.5, 0.62]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>
        ) : null,
      )}
    </>
  );
});

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
