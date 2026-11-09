// Card art fingerprints: how a photo of a card finds its catalog entry without reading any text.
//
// The phone straightens the card in a photo (modules/label-reader, Apple Vision rectangle
// detection + perspective correction) and hands over its pixels; the art-hash Edge Function
// downloads each catalog card's TCGplayer image and trims its white margin. Both then run the
// same code below, so a photo and its catalog image land on the same fingerprint:
//
//   - two 64-bit perceptual hashes (DCT of a 32×32 grayscale, low frequencies against their
//     median): one over the whole card face, one over the art window. They shrug off brightness,
//     white balance, blur and a little glare, and are compared by Hamming distance in Postgres
//     (match_card_art, 0016_card_art.sql).
//   - a coarse colour grid (4×5 cells, each channel relative to the card's average) to break
//     ties between near hashes, such as a holo and its reverse in a different set.
//
// Pure TypeScript with no imports: the app (src/services/artMatch.ts), the Edge Function (Deno)
// and the backtest (scripts/backtest) all use this one file.

/** The card face every fingerprint is taken from: 63 × 88 mm at 1.6 px/mm, close enough. */
export const CARD_W = 100;
export const CARD_H = 140;

/** A region of the card face, as shares of its width and height. */
type Region = { x0: number; x1: number; y0: number; y1: number };
/** The face inside the border: keeps rounded corners, sleeves and toploader edges out. */
export const FACE: Region = { x0: 0.05, x1: 0.95, y0: 0.04, y1: 0.96 };
/** The art window on a standard card (and the upper art on a full art). */
export const ART: Region = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.49 };

export type ArtPrint = {
  /** 64 '0'/'1' characters (Postgres bit(64) literal), whole face. */
  face: string;
  /** 64 '0'/'1' characters, art window. */
  art: string;
  /** 60 values 0..255: 4 × 5 cells × RGB, each channel relative to the face's mean. */
  color: number[];
};

/** RGB pixels, 3 bytes per pixel, row by row. */
export type Rgb = { data: Uint8Array | Uint8ClampedArray | number[]; width: number; height: number };

/** Area-average resize (each output pixel is the mean of the input pixels it covers). */
export function resizeArea(src: Rgb, w: number, h: number): Rgb {
  const out = new Uint8Array(w * h * 3);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = Math.floor(y0); yy < Math.min(src.height, Math.ceil(y1)); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.min(src.width, Math.ceil(x1)); xx++) {
          const wgt = wy * (Math.min(x1, xx + 1) - Math.max(x0, xx));
          const i = (yy * src.width + xx) * 3;
          r += src.data[i] * wgt;
          g += src.data[i + 1] * wgt;
          b += src.data[i + 2] * wgt;
          a += wgt;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
    }
  }
  return { data: out, width: w, height: h };
}

/** A region cut out of an image (shares of its size). */
export function crop(src: Rgb, r: Region): Rgb {
  const x0 = Math.round(r.x0 * src.width);
  const y0 = Math.round(r.y0 * src.height);
  const w = Math.max(1, Math.round(r.x1 * src.width) - x0);
  const h = Math.max(1, Math.round(r.y1 * src.height) - y0);
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * src.width + x0 + x) * 3;
      const o = (y * w + x) * 3;
      out[o] = src.data[i];
      out[o + 1] = src.data[i + 1];
      out[o + 2] = src.data[i + 2];
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * A catalog image's card, without the white (or near-white) margin TCGplayer puts round some
 * scans. Rows and columns from each edge are dropped while they're almost all light.
 */
export function trimMargin(src: Rgb): Rgb {
  const light = (i: number) => src.data[i] > 235 && src.data[i + 1] > 235 && src.data[i + 2] > 235;
  const rowLight = (y: number) => {
    let n = 0;
    for (let x = 0; x < src.width; x++) if (light((y * src.width + x) * 3)) n++;
    return n / src.width > 0.92;
  };
  const colLight = (x: number, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (light((y * src.width + x) * 3)) n++;
    return n / Math.max(1, y1 - y0) > 0.92;
  };
  let top = 0;
  let bottom = src.height;
  while (top < bottom - 1 && rowLight(top)) top++;
  while (bottom - 1 > top && rowLight(bottom - 1)) bottom--;
  let left = 0;
  let right = src.width;
  while (left < right - 1 && colLight(left, top, bottom)) left++;
  while (right - 1 > left && colLight(right - 1, top, bottom)) right--;
  // Nothing sensible left (an all-white placeholder): keep the image as it was.
  if (right - left < src.width * 0.4 || bottom - top < src.height * 0.4) return src;
  if (top === 0 && left === 0 && bottom === src.height && right === src.width) return src;
  return crop(src, { x0: left / src.width, x1: right / src.width, y0: top / src.height, y1: bottom / src.height });
}

const N = 32;
const K = 8;
// cos((2x+1)uπ / 2N) for the 8 lowest frequencies.
const COS: number[][] = Array.from({ length: K }, (_, u) => Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))));

/** 64-bit perceptual hash of an image region, as a bit(64) literal. */
export function pHash(src: Rgb): string {
  const small = resizeArea(src, N, N);
  const gray = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) gray[i] = 0.299 * small.data[i * 3] + 0.587 * small.data[i * 3 + 1] + 0.114 * small.data[i * 3 + 2];
  // Separable DCT-II, low 8×8 only: rows first, then columns.
  const rows = new Float64Array(N * K);
  for (let y = 0; y < N; y++) for (let u = 0; u < K; u++) {
    let s = 0;
    for (let x = 0; x < N; x++) s += gray[y * N + x] * COS[u][x];
    rows[y * K + u] = s;
  }
  const coef: number[] = [];
  for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) {
    let s = 0;
    for (let y = 0; y < N; y++) s += rows[y * K + u] * COS[v][y];
    coef.push(s);
  }
  // Median of the 63 AC terms: the DC term is just overall brightness.
  const ac = coef.slice(1).sort((a, b) => a - b);
  const median = ac[31];
  return coef.map((c, i) => (i === 0 ? '1' : c > median ? '1' : '0')).join('');
}

/** 4 × 5 grid of mean colours, each channel divided by its face-wide mean (×128, capped). */
export function colorGrid(src: Rgb, cols = 4, rows = 5): number[] {
  const small = resizeArea(src, cols, rows);
  const mean = [0, 0, 0];
  for (let i = 0; i < cols * rows; i++) for (let c = 0; c < 3; c++) mean[c] += small.data[i * 3 + c] / (cols * rows);
  const out: number[] = [];
  for (let i = 0; i < cols * rows; i++) for (let c = 0; c < 3; c++) out.push(Math.min(255, Math.round((small.data[i * 3 + c] / Math.max(1, mean[c])) * 128)));
  return out;
}

/** The fingerprint of a straightened card face (any size; it's brought to CARD_W × CARD_H). */
export function artPrint(card: Rgb): ArtPrint {
  const face = card.width === CARD_W && card.height === CARD_H ? card : resizeArea(card, CARD_W, CARD_H);
  const inner = crop(face, FACE);
  return { face: pHash(inner), art: pHash(crop(face, ART)), color: colorGrid(inner) };
}

/** Bits that differ between two bit(64) literals. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Mean absolute difference between two colour grids (0 = same, ~40+ = unrelated). */
export function colorDistance(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 24;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * One number for how far a photo is from a catalog card: Hamming over both hashes (0..128) plus
 * the colour gap scaled to the same feel. Unrelated cards sit around 60–70; the same card
 * photographed sits well under 40.
 */
export function artDistance(dFace: number, dArt: number, dColor: number): number {
  return dFace + dArt + dColor / 3;
}
