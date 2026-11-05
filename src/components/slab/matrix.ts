// 4×4 transforms for the slab's faces, in React Native's (and CSS matrix3d's) layout: row
// vectors, p' = p · M, translation in m[12..14]. One camera for the whole box.

import type { SlabLayout } from './geometry';

export type M4 = number[];

const I = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const rad = (d: number) => (d * Math.PI) / 180;

/** a then b: p · (a · b). */
export function mul(a: M4, b: M4): M4 {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[i * 4 + k] * b[k * 4 + j];
      r[i * 4 + j] = v;
    }
  return r;
}

export function rotateX(deg: number): M4 {
  const m = I();
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotateY(deg: number): M4 {
  const m = I();
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function translate(x: number, y: number, z: number): M4 {
  const m = I();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function perspective(p: number): M4 {
  const m = I();
  m[11] = -1 / p;
  return m;
}

/** Apply M to a point (w = 1), returning the projected 2D point. */
export function project(m: M4, x: number, y: number, z: number): [number, number] {
  const X = x * m[0] + y * m[4] + z * m[8] + m[12];
  const Y = x * m[1] + y * m[5] + z * m[9] + m[13];
  const W = x * m[3] + y * m[7] + z * m[11] + m[15];
  return [X / W, Y / W];
}

type Vec = [number, number, number];
const apply3 = (m: M4, [x, y, z]: Vec, w: number): Vec => [
  x * m[0] + y * m[4] + z * m[8] + w * m[12],
  x * m[1] + y * m[5] + z * m[9] + w * m[13],
  x * m[2] + y * m[6] + z * m[10] + w * m[14],
];

export type Face = { matrix: M4; opacity: number };

/**
 * Matrices for the six faces at this pose. Each face is a view centred on the slab; its
 * matrix orients it, moves it out to its side of the box, turns the box (yaw, then pitch)
 * and projects. Opacity is 1 while the face points at the camera (edges fade in as they turn
 * toward it, so a grazing edge never flickers) and 0 once it points away.
 */
export function faceMatrices(L: SlabLayout, yaw: number, pitch: number, P: number) {
  const box = mul(rotateY(yaw), rotateX(pitch));
  const cam = perspective(P);
  const eye: Vec = [0, 0, P];
  const d = L.depth / 2;
  const hw = L.w / 2;
  const hh = L.h / 2;

  const face = (orient: M4, at: Vec, fade: number): Face => {
    const local = mul(orient, translate(...at));
    const world = mul(local, box);
    const n = apply3(world, [0, 0, 1], 0);
    const c = apply3(world, [0, 0, 0], 1);
    const v: Vec = [eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]];
    const len = Math.hypot(...v) || 1;
    const facing = (n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) / len;
    return { matrix: mul(world, cam), opacity: Math.min(1, Math.max(0, facing / fade)) };
  };

  return {
    front: face(I(), [0, 0, d], 0.02),
    back: face(rotateY(180), [0, 0, -d], 0.02),
    right: face(rotateY(90), [hw, 0, 0], 0.12),
    left: face(rotateY(-90), [-hw, 0, 0], 0.12),
    top: face(rotateX(90), [0, -hh, 0], 0.12),
    bottom: face(rotateX(-90), [0, hh, 0], 0.12),
  };
}
