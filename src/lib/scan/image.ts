/** Grayscale + binarization utilities for the scanner. */

export interface GrayImage {
  w: number;
  h: number;
  data: Uint8Array;
}

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export function toGray(src: RGBAImage): GrayImage {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    out[i] = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
  }
  return { w, h, data: out };
}

/** 2x box downscale. */
export function downscale2(g: GrayImage): GrayImage {
  const w = g.w >> 1;
  const h = g.h >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 2) * g.w + x * 2;
      out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.w] + g.data[i + g.w + 1]) >> 2;
    }
  }
  return { w, h, data: out };
}

/** Downscale until width <= maxW. */
export function fitWidth(g: GrayImage, maxW: number): GrayImage {
  let cur = g;
  while (cur.w > maxW) cur = downscale2(cur);
  return cur;
}

/** Otsu threshold for a grayscale image. */
export function otsu(g: GrayImage): number {
  const hist = new Float64Array(256);
  const n = g.w * g.h;
  for (let i = 0; i < n; i++) hist[g.data[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) {
      best = v;
      bestT = t;
    }
  }
  return bestT;
}

/** Binarize: 1 = dark ink, 0 = background. */
export function binarize(g: GrayImage, t?: number): Uint8Array {
  const th = t ?? otsu(g);
  const out = new Uint8Array(g.w * g.h);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] <= th ? 1 : 0;
  return out;
}
