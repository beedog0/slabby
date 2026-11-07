// The slab as a real box: front, back and four acrylic edges. Every face gets one exact 4×4
// matrix built from the same camera: orient the face, push it out to its place on the box
// (a true z offset), turn the whole box by yaw then pitch, project with one perspective. All
// faces share the slab's centre as their transform origin, so the edges meet the faces at
// every angle. Yaw spins freely through 360°; pitch tilts.
//
// Static slabs take plain numbers. Interactive ones take Animated.Values (JS-driven) and
// re-render on each change; only the six matrices change, the faces themselves are memoized.

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useReducer, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useIsDark } from '../../theme/theme';
import type { Card } from '../../types';
import { BackFace, EdgeStrip, FrontFace } from './SlabFaces';
import { slabLayout, type SlabLayout } from './geometry';
import { faceMatrices } from './matrix';
import { FoilSheen, foilOf } from './foil';

type Props = {
  card: Card;
  width: number;
  /** Yaw in degrees, any value (360° spins wrap). */
  yaw: number | Animated.Value;
  /** Pitch in degrees, about ±40 at most. */
  pitch: number | Animated.Value;
  perspective?: number;
  /** Floor shadow under the slab. */
  shadow?: boolean;
  /** Keep the card art at full resolution (the full-screen viewer). */
  sharp?: boolean;
};

/** Follow an Animated.Value (or a number) as a plain number, re-rendering once per frame. */
function useLive(v: number | Animated.Value, w: number | Animated.Value): [number, number] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const subs: [Animated.Value, string][] = [];
    const schedule = () => {
      if (frame.current == null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          bump();
        });
      }
    };
    for (const x of [v, w]) if (typeof x !== 'number') subs.push([x, x.addListener(schedule)]);
    return () => {
      subs.forEach(([x, id]) => x.removeListener(id));
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [v, w]);
  const read = (x: number | Animated.Value) => (typeof x === 'number' ? x : (x as unknown as { __getValue(): number }).__getValue());
  return [read(v), read(w)];
}

// Native takes a 16-value `matrix` as is; react-native-web needs it spelled matrix3d.
const m3d = (m: number[]) => (Platform.OS === 'web' ? [{ matrix3d: m }] : [{ matrix: m }]) as never;

// Each face's print (not the moving glare) is drawn flat into one bitmap first, then that
// bitmap is turned in 3D. Without
// this, iOS turns every thin layer (the red label frame, barcode bars, hairlines) on its own
// and their edges stair-step at an angle; a bitmap is filtered smoothly instead.
const FLATTEN = { shouldRasterizeIOS: true, renderToHardwareTextureAndroid: true } as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const Slab3D = memo(function Slab3D({ card, width, yaw: yawIn, pitch: pitchIn, perspective, shadow = true, sharp = false }: Props) {
  const [yaw, pitch] = useLive(yawIn, pitchIn);
  const dark = useIsDark();
  const L = slabLayout(width, card.grader);
  const P = perspective ?? Math.max(900, width * 5);
  const f = faceMatrices(L, yaw, pitch, P);
  const foil = foilOf(card);

  const s = Math.sin((yaw * Math.PI) / 180);
  const c = Math.cos((yaw * Math.PI) / 180);
  const sa = Math.sin((pitch * Math.PI) / 180);

  // Glare slides across the face as it turns; faces darken as they turn from the light.
  const glareX = -s * L.w * 1.5 + sa * L.w * 0.6;
  const glareOpacity = 0.26 + 0.24 * Math.min(1, Math.abs(s) * 3);
  const frontShade = 0.22 * (1 - clamp01(c));
  const backShade = 0.22 * (1 - clamp01(-c));
  const shadowScale = Math.max(0.14, Math.abs(c));

  // Edges run the full height and width: seen side-on the case is a plain rectangle, so a
  // shorter strip let the face's corners poke out past it.
  const sideLen = L.h;
  const capLen = L.w;
  // Every face is laid out centred on the slab, so its transform origin is the slab's centre.
  const center = (w: number, h: number) => ({ position: 'absolute' as const, left: (L.w - w) / 2, top: (L.h - h) / 2, width: w, height: h });

  const glare = (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        { width: L.w * 0.9, height: L.h * 1.8, top: -L.h * 0.4, left: L.w * 0.05, opacity: glareOpacity },
        { transform: [{ translateX: glareX }, { rotate: '24deg' }] },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 0.6, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );

  const edge = (key: 'right' | 'left' | 'top' | 'bottom') => {
    const face = f[key];
    if (face.opacity <= 0) return null;
    const vertical = key === 'right' || key === 'left';
    return (
      <View key={key} {...FLATTEN} collapsable={false} style={[center(vertical ? L.depth : capLen, vertical ? sideLen : L.depth), { opacity: face.opacity, transform: m3d(face.matrix) }]}>
        <EdgeStrip length={vertical ? sideLen : capLen} depth={L.depth} vertical={vertical} />
        {dark ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: DARK_LIGHT.edge }]} /> : null}
      </View>
    );
  };

  return (
    <View style={{ width: L.w, height: L.h }}>
      {shadow ? <FloorShadow L={L} scale={shadowScale} /> : null}
      {edge('right')}
      {edge('left')}
      {edge('top')}
      {edge('bottom')}
      <View
        style={[center(L.w, L.h), styles.face, { opacity: f.back.opacity, transform: m3d(f.back.matrix) }]}
        pointerEvents={f.back.opacity > 0 ? 'auto' : 'none'}
      >
        <View {...FLATTEN} collapsable={false} style={StyleSheet.absoluteFill}>
          <BackFace card={card} L={L} />
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: L.corner, overflow: 'hidden' }]}>
          {glare}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backShade }]} />
        </View>
      </View>
      <View
        style={[center(L.w, L.h), styles.face, { opacity: f.front.opacity, transform: m3d(f.front.matrix) }]}
        pointerEvents={f.front.opacity > 0 ? 'auto' : 'none'}
      >
        <View {...FLATTEN} collapsable={false} style={StyleSheet.absoluteFill}>
          <FrontFace card={card} L={L} sharp={sharp} />
        </View>
        {foil ? <FoilSheen kind={foil} L={L} s={s} sa={sa} /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: L.corner, overflow: 'hidden' }]}>
          {glare}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: frontShade }]} />
        </View>
      </View>
    </View>
  );
});

/**
 * Dark mode only. On black a flat white case reads as a cut-out photo, so it's lit like an object
 * under a warm light from the front: the face stays evenly lit top to bottom, and the acrylic
 * edges sit in shade. The label band at the top is left untouched, so grader colors stay true.
 */
const DARK_LIGHT = { edge: 0.38 } as const;


const FloorShadow = memo(function FloorShadow({ L, scale }: { L: SlabLayout; scale: number }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.abs, { left: -L.w * 0.1, width: L.w * 1.2, top: L.h * 0.95, height: L.h * 0.16 }, { transform: [{ scaleX: scale }] }]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="floor" cx="50" cy="40" rx="50" ry="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#000" stopOpacity={0.22} />
            <Stop offset="0.55" stopColor="#000" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="40" rx="50" ry="50" fill="url(#floor)" />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  face: { backfaceVisibility: 'hidden' },
});
