// The slab as a real box: front, back and four acrylic edges, each placed with its own
// transform so the case has depth when it turns (React Native has no translateZ, so every
// face's centre is projected by hand). Yaw spins freely through 360°; pitch tilts.
//
// The same math runs on plain numbers (static slabs in lists: no animated nodes) or on
// Animated values (the detail screen and the viewer: native-driven, 60 fps).

import { memo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { Card } from '../../types';
import { BackFace, EdgeStrip, FrontFace } from './SlabFaces';
import { slabLayout, type SlabLayout } from './geometry';

type Node = Animated.Value | Animated.AnimatedInterpolation<number> | Animated.AnimatedMultiplication | Animated.AnimatedAddition | Animated.AnimatedDivision | Animated.AnimatedModulo;
type V = number | Node;

type Props = {
  card: Card;
  width: number;
  /** Yaw in degrees, any value (360° spins wrap). */
  yaw: V;
  /** Pitch in degrees, about ±40 at most. */
  pitch: V;
  perspective?: number;
  /** Floor shadow under the slab. */
  shadow?: boolean;
};

const STEPS = Array.from({ length: 37 }, (_, i) => i * 10);
const SIN = STEPS.map((d) => Math.sin((d * Math.PI) / 180));
const COS = STEPS.map((d) => Math.cos((d * Math.PI) / 180));
const PITCH = Array.from({ length: 19 }, (_, i) => -90 + i * 10);
const PSIN = PITCH.map((d) => Math.sin((d * Math.PI) / 180));
const PCOS = PITCH.map((d) => Math.cos((d * Math.PI) / 180));

type Ops = {
  mul: (a: V, b: V) => V;
  add: (a: V, b: V) => V;
  div: (a: V, b: V) => V;
  map: (v: V, input: number[], output: number[]) => V;
  deg: (v: V, offset: number) => string | Node;
};

const num: Ops = {
  mul: (a, b) => (a as number) * (b as number),
  add: (a, b) => (a as number) + (b as number),
  div: (a, b) => (a as number) / (b as number),
  map: (v, input, output) => {
    const x = v as number;
    if (x <= input[0]) return output[0];
    for (let i = 1; i < input.length; i++) {
      if (x <= input[i]) {
        const t = (x - input[i - 1]) / (input[i] - input[i - 1]);
        return output[i - 1] + t * (output[i] - output[i - 1]);
      }
    }
    return output[output.length - 1];
  },
  deg: (v, offset) => `${(v as number) + offset}deg`,
};

const anim: Ops = {
  mul: (a, b) => Animated.multiply(a as Node, b as Node),
  add: (a, b) => Animated.add(a as Node, b as Node),
  div: (a, b) => Animated.divide(a as Node, b as Node),
  map: (v, input, output) =>
    typeof v === 'number' ? num.map(v, input, output) : (v as Animated.Value).interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' }),
  deg: (v, offset) =>
    typeof v === 'number' ? `${v + offset}deg` : (v as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: [`${offset}deg`, `${offset + 1}deg`] }),
};

function wrap360(o: Ops, yaw: V): V {
  if (typeof yaw === 'number') return ((yaw % 360) + 360) % 360;
  return Animated.modulo(yaw as Node, 360);
}

type Placed = { transform: object[]; opacity: V };

/** Where each face sits on screen for this pose. */
function pose(o: Ops, L: SlabLayout, yaw: V, pitch: V, P: number) {
  const y360 = wrap360(o, yaw);
  const s = o.map(y360, STEPS, SIN);
  const c = o.map(y360, STEPS, COS);
  const sa = o.map(pitch, PITCH, PSIN);
  const ca = o.map(pitch, PITCH, PCOS);
  const d = L.depth / 2;
  const hw = L.w / 2;
  const hh = L.h / 2;

  // Project a face centre (x, y, z), then hand back its transform.
  const place = (x: V, y: V, z: V, rotations: object[], facing: V, fadeIn = 0.0001): Placed => {
    const f = o.div(P, o.add(P, o.mul(z, -1)));
    return {
      transform: [
        { translateX: o.mul(x, f) },
        { translateY: o.mul(y, f) },
        { perspective: P },
        { scale: f },
        { rotateX: o.deg(pitch, 0) },
        ...rotations,
      ],
      // A face shows only while it points at the viewer.
      // Edges fade in as they turn toward the viewer, so a grazing edge never flickers.
      opacity: o.map(facing, [-1, 0, fadeIn, 1], [0, 0, 1, 1]),
    };
  };
  const cs = o.mul(c, sa);
  const cc = o.mul(c, ca);
  const ss = o.mul(s, sa);
  const sc = o.mul(s, ca);

  return {
    s,
    c,
    sa,
    front: place(o.mul(s, d), o.mul(cs, -d), o.mul(cc, d), [{ rotateY: o.deg(yaw, 0) }], c),
    back: place(o.mul(s, -d), o.mul(cs, d), o.mul(cc, -d), [{ rotateY: o.deg(yaw, 180) }], o.mul(c, -1)),
    right: place(o.mul(c, hw), o.mul(ss, hw), o.mul(sc, -hw), [{ rotateY: o.deg(yaw, 90) }], o.mul(s, -1), 0.1),
    left: place(o.mul(c, -hw), o.mul(ss, -hw), o.mul(sc, hw), [{ rotateY: o.deg(yaw, -90) }], s, 0.1),
    top: place(0, o.mul(ca, -hh), o.mul(sa, -hh), [{ rotateY: o.deg(yaw, 0) }, { rotateX: '90deg' }], o.mul(sa, -1), 0.12),
    bottom: place(0, o.mul(ca, hh), o.mul(sa, hh), [{ rotateY: o.deg(yaw, 0) }, { rotateX: '-90deg' }], sa, 0.12),
  };
}

export const Slab3D = memo(function Slab3D({ card, width, yaw, pitch, perspective, shadow = true }: Props) {
  const L = slabLayout(width, card.grader);
  const P = perspective ?? Math.max(900, width * 5);
  const live = typeof yaw !== 'number' || typeof pitch !== 'number';
  const o = live ? anim : num;
  const p = pose(o, L, yaw, pitch, P);
  const Box = live ? Animated.View : View;

  // Glare slides across the face as it turns; faces darken as they turn from the light.
  const glareX = o.add(o.mul(p.s, -L.w * 1.5), o.mul(p.sa, L.w * 0.6));
  const glareOpacity = o.map(p.s, [-1, -0.3, 0, 0.3, 1], [0.5, 0.42, 0.26, 0.42, 0.5]);
  const frontShade = o.map(p.c, [0, 1], [0.22, 0]);
  const backShade = o.map(p.c, [-1, 0], [0, 0.22]);
  const shadowScale = o.map(p.c, [-1, -0.1, 0, 0.1, 1], [1, 0.2, 0.14, 0.2, 1]);

  const center = (w: number, h: number) => ({ position: 'absolute' as const, left: (L.w - w) / 2, top: (L.h - h) / 2, width: w, height: h });
  const sideLen = L.h - L.corner * 1.2;
  const capLen = L.w - L.corner * 1.2;

  const glare = (
    <Box
      pointerEvents="none"
      style={[
        styles.glare,
        { width: L.w * 0.9, height: L.h * 1.8, top: -L.h * 0.4, left: L.w * 0.05, opacity: glareOpacity as never },
        { transform: [{ translateX: glareX as never }, { rotate: '24deg' }] },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 0.6, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Box>
  );

  return (
    <View style={{ width: L.w, height: L.h }}>
      {shadow ? (
        <Box
          pointerEvents="none"
          style={[
            styles.floor,
            { left: -L.w * 0.1, width: L.w * 1.2, top: L.h - L.h * 0.05, height: L.h * 0.16 },
            { transform: [{ scaleX: shadowScale as never }] },
          ]}
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
        </Box>
      ) : null}

      <Box style={[center(L.depth, sideLen), { opacity: p.right.opacity as never, transform: p.right.transform as never }]}>
        <EdgeStrip length={sideLen} depth={L.depth} vertical />
      </Box>
      <Box style={[center(L.depth, sideLen), { opacity: p.left.opacity as never, transform: p.left.transform as never }]}>
        <EdgeStrip length={sideLen} depth={L.depth} vertical />
      </Box>
      <Box style={[center(capLen, L.depth), { opacity: p.top.opacity as never, transform: p.top.transform as never }]}>
        <EdgeStrip length={capLen} depth={L.depth} vertical={false} />
      </Box>
      <Box style={[center(capLen, L.depth), { opacity: p.bottom.opacity as never, transform: p.bottom.transform as never }]}>
        <EdgeStrip length={capLen} depth={L.depth} vertical={false} />
      </Box>

      <Box style={[center(L.w, L.h), styles.face, { opacity: p.back.opacity as never, transform: p.back.transform as never }]}>
        <BackFace card={card} L={L} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: L.corner, overflow: 'hidden' }]}>
          {glare}
          <Box style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backShade as never }]} />
        </View>
      </Box>

      <Box style={[center(L.w, L.h), styles.face, { opacity: p.front.opacity as never, transform: p.front.transform as never }]}>
        <FrontFace card={card} L={L} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: L.corner, overflow: 'hidden' }]}>
          {glare}
          <Box style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: frontShade as never }]} />
        </View>
      </Box>
    </View>
  );
});

const styles = StyleSheet.create({
  face: { backfaceVisibility: 'hidden' },
  glare: { position: 'absolute' },
  floor: { position: 'absolute' },
});
