/**
 * Test-only rasterizer: draws the same primitive list the canvas renderer
 * uses into a raw RGBA buffer, so tests exercise the real render path.
 * Also provides camera-like distortions (rotate/scale/blur/noise/occlude).
 */
import type { Layout, Prim, Vec } from "@/lib/layout/types";

export interface RGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const TONE: Record<string, number> = { dark: 0, light: 255, gray: 205 };

function blank(w: number, h: number): RGBA {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { width: w, height: h, data };
}

function px(img: RGBA, x: number, y: number, v: number) {
  const i = (y * img.width + x) * 4;
  img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
}

function disc(img: RGBA, cx: number, cy: number, r: number, v: number) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) px(img, x, y, v);
    }
  }
}

function ring(img: RGBA, cx: number, cy: number, r: number, w: number, v: number) {
  const R = r + w / 2;
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + R));
  const lo = r - w / 2;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= lo && d <= R) px(img, x, y, v);
    }
  }
}

function poly(img: RGBA, pts: Vec[], w: number, v: number) {
  const r = w / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      disc(img, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r, v);
    }
  }
}

/** Even-odd polygon fill via scanline. */
function fillPoly(img: RGBA, pts: Vec[], v: number) {
  const n = pts.length;
  if (n < 3) return;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of pts) {
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const y0 = Math.max(0, Math.floor(yMin));
  const y1 = Math.min(img.height - 1, Math.ceil(yMax));
  // bucket edges by the scanlines they can cross
  const buckets: number[][] = Array.from({ length: y1 - y0 + 1 }, () => []);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.y === b.y) continue;
    const lo = Math.max(y0, Math.floor(Math.min(a.y, b.y)));
    const hi = Math.min(y1, Math.floor(Math.max(a.y, b.y)));
    for (let y = lo; y <= hi; y++) buckets[y - y0].push(i);
  }
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (const i of buckets[y - y0]) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (a.y <= yc !== b.y <= yc) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round(xs[k]));
      const x1 = Math.min(img.width - 1, Math.round(xs[k + 1]));
      for (let x = x0; x <= x1; x++) px(img, x, y, v);
    }
  }
}

export function rasterize(
  layout: Layout,
  prims: Prim[],
  opts: { scale?: number; quiet?: number } = {}
): RGBA {
  const scale = opts.scale ?? 1;
  const quiet = opts.quiet ?? 24;
  const img = blank(Math.ceil((layout.width + quiet * 2) * scale), Math.ceil((layout.height + quiet * 2) * scale));
  for (const p of prims) {
    const v = TONE[p.tone ?? "dark"];
    if (p.t === "disc") disc(img, (p.x + quiet) * scale, (p.y + quiet) * scale, p.r * scale, v);
    else if (p.t === "ring") ring(img, (p.x + quiet) * scale, (p.y + quiet) * scale, p.r * scale, p.w * scale, v);
    else if (p.t === "fill")
      fillPoly(
        img,
        p.pts.map((q) => ({ x: (q.x + quiet) * scale, y: (q.y + quiet) * scale })),
        v
      );
    else
      poly(
        img,
        p.pts.map((q) => ({ x: (q.x + quiet) * scale, y: (q.y + quiet) * scale })),
        p.w * scale,
        v
      );
  }
  return img;
}

/** Embed image in a larger white canvas. */
export function embed(src: RGBA, pad: number): RGBA {
  const out = blank(src.width + pad * 2, src.height + pad * 2);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((y + pad) * out.width + x + pad) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
    }
  }
  return out;
}

/** Rotate+scale about the centre (nearest-neighbour). */
export function transform(src: RGBA, angle: number, scale = 1): RGBA {
  const out = blank(src.width, src.height);
  const cx = src.width / 2;
  const cy = src.height / 2;
  const cos = Math.cos(-angle) / scale;
  const sin = Math.sin(-angle) / scale;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx >= 0 && sx < src.width && sy >= 0 && sy < src.height) {
        const si = (sy * src.width + sx) * 4;
        const di = (y * out.width + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
      }
    }
  }
  return out;
}

export function boxBlur(src: RGBA, r: number): RGBA {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx >= 0 && sx < src.width && sy >= 0 && sy < src.height) {
            sum += src.data[(sy * src.width + sx) * 4];
            n++;
          }
        }
      }
      px(out, x, y, sum / n);
    }
  }
  return out;
}

export function noise(src: RGBA, amt: number, seed = 42): RGBA {
  const out = blank(src.width, src.height);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < src.data.length; i += 4) {
    const v = Math.min(255, Math.max(0, src.data[i] + (rnd() - 0.5) * 2 * amt));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
  }
  return out;
}

export function reduceContrast(src: RGBA, f: number): RGBA {
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const v = 128 + (src.data[i] - 128) * f;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = Math.min(255, Math.max(0, v));
  }
  return out;
}

export function occlude(src: RGBA, x: number, y: number, w: number, h: number): RGBA {
  const out: RGBA = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && xx < out.width && yy >= 0 && yy < out.height) px(out, xx, yy, 255);
    }
  }
  return out;
}
