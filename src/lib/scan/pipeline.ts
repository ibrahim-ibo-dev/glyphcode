import { bitsToBytes } from "../codec/bits";
import { decodeCodewords, type DecodeResult } from "../codec/decode";
import { MAGIC, PREFIX_BYTES, VERSION, frameLayout, unpackMeta } from "../codec/format";
import { ALL_STYLES, getLayoutVariants } from "../layout";
import type { Layout, Vec } from "../layout/types";
import { binarize, fitWidth, toGray, type RGBAImage } from "./image";
import { findMarkers, type MarkerCand } from "./markers";

export interface ScanSuccess extends DecodeResult {
  /** Detected finder markers in original-image coordinates. */
  imageMarkers: [Vec, Vec];
  /** Downscale factor applied before detection (multiply scan coords by this). */
  coordScale: number;
}

interface Transform {
  s: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

/** Similarity transform mapping canonical layout coords -> image coords. */
function fitTransform(cm1: Vec, cm2: Vec, im1: Vec, im2: Vec): Transform {
  const dcx = cm2.x - cm1.x;
  const dcy = cm2.y - cm1.y;
  const dix = im2.x - im1.x;
  const diy = im2.y - im1.y;
  const s = Math.hypot(dix, diy) / Math.hypot(dcx, dcy);
  const ang = Math.atan2(diy, dix) - Math.atan2(dcy, dcx);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return {
    s,
    cos,
    sin,
    tx: im1.x - (cm1.x * cos - cm1.y * sin) * s,
    ty: im1.y - (cm1.x * sin + cm1.y * cos) * s,
  };
}

function mapX(T: Transform, x: number, y: number): number {
  return tx_of(T, x, y);
}
function tx_of(T: Transform, x: number, y: number): number {
  return T.tx + (x * T.cos - y * T.sin) * T.s;
}
function mapY(T: Transform, x: number, y: number): number {
  return T.ty + (x * T.sin + y * T.cos) * T.s;
}

/** Fraction of dark pixels inside a square patch centred at (x,y). */
function patchDark(bin: Uint8Array, w: number, h: number, x: number, y: number, r: number): number {
  const x0 = Math.max(0, Math.round(x) - r);
  const x1 = Math.min(w - 1, Math.round(x) + r);
  const y0 = Math.max(0, Math.round(y) - r);
  const y1 = Math.min(h - 1, Math.round(y) + r);
  if (x1 <= x0 || y1 <= y0) return 0;
  let dark = 0;
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * w;
    for (let xx = x0; xx <= x1; xx++) dark += bin[row + xx];
  }
  return dark / ((x1 - x0 + 1) * (y1 - y0 + 1));
}

/**
 * Read a differential probe by finding the ink centroid along a narrow
 * vertical strip at the cell centre. The wave's transitions between cells
 * are nearly vertical strokes; centroid-of-ink at the cell centre ignores
 * them entirely, unlike a two-point comparison.
 */
/**
 * Read a differential probe by integrating ink over the 2D box spanned
 * by the probe axis (up->down) and the in-cell half-extent vector, then
 * taking the centroid along the axis. Box integration ignores cell-edge
 * transitions entirely and is robust at small scales.
 */
function diffBit(
  bin: Uint8Array,
  w: number,
  h: number,
  xUp: number,
  yUp: number,
  xDown: number,
  yDown: number,
  hx: number,
  hy: number
): number {
  const ax = xDown - xUp;
  const ay = yDown - yUp;
  const cx = (xUp + xDown) / 2;
  const cy = (yUp + yDown) / 2;
  const nH = Math.max(2, Math.ceil(Math.hypot(hx, hy) / 1.2));
  const nA = Math.max(4, Math.ceil(Math.hypot(ax, ay) / 1.2));
  let sum = 0;
  let wsum = 0;
  for (let i = -nH; i <= nH; i++) {
    const fi = i / nH;
    for (let j = -nA; j <= nA; j++) {
      const fj = j / nA;
      const x = Math.round(cx + hx * fi + (ax / 2) * fj);
      const y = Math.round(cy + hy * fi + (ay / 2) * fj);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const f = bin[y * w + x];
      sum += f * fj;
      wsum += f;
    }
  }
  if (wsum === 0) return 0;
  return sum / wsum < 0 ? 1 : 0;
}

function sampleBits(
  bin: Uint8Array,
  w: number,
  h: number,
  layout: Layout,
  T: Transform,
  patchR: number,
  from: number,
  count: number
): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const pr = layout.probes[from + i];
    if (pr.kind === "presence") {
      const f = patchDark(bin, w, h, mapX(T, pr.p.x, pr.p.y), mapY(T, pr.p.x, pr.p.y), patchR);
      out[i] = f > 0.38 ? 1 : 0;
    } else {
      out[i] = diffBit(
        bin,
        w,
        h,
        mapX(T, pr.up.x, pr.up.y),
        mapY(T, pr.up.x, pr.up.y),
        mapX(T, pr.down.x, pr.down.y),
        mapY(T, pr.down.x, pr.down.y),
        // half is a direction vector: rotate+scale only, no translation
        (pr.half.x * T.cos - pr.half.y * T.sin) * T.s,
        (pr.half.x * T.sin + pr.half.y * T.cos) * T.s
      );
    }
  }
  return out;
}

/**
 * Full pipeline: RGBA frame -> decoded text.
 * Returns null when nothing decodes (no markers, bad magic, RS/CRC fail).
 * `maxW` bounds the analysis width — small codes in frame benefit from
 * a higher limit (the caller can retry at full resolution on failure).
 */
export function decodeImage(src: RGBAImage, maxW = 760): ScanSuccess | null {
  const gray = fitWidth(toGray(src), maxW);
  const coordScale = src.width / gray.w;
  const bin = binarize(gray);
  const { w, h } = gray;
  const markers = findMarkers(bin, w, h);
  if (markers.length < 2) return null;

  const layouts = ALL_STYLES.flatMap((s) => getLayoutVariants(s));

  for (let a = 0; a < markers.length; a++) {
    for (let b = a + 1; b < markers.length; b++) {
      for (const flip of [false, true]) {
        const im1 = flip ? markers[b] : markers[a];
        const im2 = flip ? markers[a] : markers[b];
        for (const layout of layouts) {
          const T = fitTransform(layout.markers[0], layout.markers[1], im1, im2);
          const scaledPitch = layout.pitch * T.s;
          if (scaledPitch < 2.3) continue; // code too small in frame to read
          // Marker-size sanity: the detected outer radii must match the
          // layout's marker radii once scaled. Rejects false bullseye
          // candidates (wavy rings, spiral arm pieces) before probing.
          if (Math.abs(im1.r / (layout.markerRadii[0] * T.s) - 1) > 0.5) continue;
          if (Math.abs(im2.r / (layout.markerRadii[1] * T.s) - 1) > 0.5) continue;
          const patchR = Math.max(1, Math.min(8, Math.round(scaledPitch * 0.32)));

          // Cheap gate: decode just the 32-bit prefix first.
          const prefixBits = sampleBits(bin, w, h, layout, T, patchR, 0, PREFIX_BYTES * 8);
          const prefix = bitsToBytes(prefixBits);
          if (prefix[0] !== MAGIC || prefix[1] !== VERSION) continue;
          const meta = unpackMeta(prefix[2]);
          if (!meta) continue;
          const payloadLen = (meta.lenHi << 8) | prefix[3];
          const { totalBytes } = frameLayout(payloadLen, meta.ecc);
          const totalBits = totalBytes * 8;
          if (totalBits > layout.bitCount) continue;

          const bits = sampleBits(bin, w, h, layout, T, patchR, 0, totalBits);
          try {
            const res = decodeCodewords(bitsToBytes(bits, totalBits));
            return {
              ...res,
              imageMarkers: [im1, im2].map((m) => ({ x: m.x * coordScale, y: m.y * coordScale })) as [Vec, Vec],
              coordScale,
            };
          } catch {
            continue;
          }
        }
      }
    }
  }
  return null;
}
