/**
 * Finder-marker detection.
 *
 * Every style carries two "bullseye" markers (dark ring / light gap /
 * dark core). After binarization we label connected components and keep
 * the ones whose scanlines through the bounding-box centre show the
 * signature DARK-LIGHT-DARK-LIGHT-DARK alternation (>=4 transitions) on
 * both axes. A plain ring (3 runs) or a plain dot (1 run) is rejected,
 * so data dots cannot pose as markers.
 */

export interface MarkerCand {
  x: number;
  y: number;
  r: number; // outer radius
  area: number;
}

interface Comp {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

function labelComponents(bin: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(bin.length);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    const comp: Comp = { minX: w, minY: h, maxX: -1, maxY: -1, area: 0 };
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % w;
      const y = (idx / w) | 0;
      comp.area++;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      // 4-connectivity
      if (x > 0 && bin[idx - 1] && !seen[idx - 1]) {
        seen[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < w - 1 && bin[idx + 1] && !seen[idx + 1]) {
        seen[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && bin[idx - w] && !seen[idx - w]) {
        seen[idx - w] = 1;
        stack.push(idx - w);
      }
      if (y < h - 1 && bin[idx + w] && !seen[idx + w]) {
        seen[idx + w] = 1;
        stack.push(idx + w);
      }
    }
    comps.push(comp);
  }
  return comps;
}

function rowTransitions(bin: Uint8Array, w: number, y: number, x0: number, x1: number): number {
  let t = 0;
  let prev = bin[y * w + x0];
  for (let x = x0 + 1; x <= x1; x++) {
    const v = bin[y * w + x];
    if (v !== prev) {
      t++;
      prev = v;
    }
  }
  return t;
}

function colTransitions(bin: Uint8Array, w: number, x: number, y0: number, y1: number): number {
  let t = 0;
  let prev = bin[y0 * w + x];
  for (let y = y0 + 1; y <= y1; y++) {
    const v = bin[y * w + x];
    if (v !== prev) {
      t++;
      prev = v;
    }
  }
  return t;
}

export function findMarkers(bin: Uint8Array, w: number, h: number, maxCand = 28): MarkerCand[] {
  const comps = labelComponents(bin, w, h);
  const cands: MarkerCand[] = [];
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (bw < 8 || bh < 8) continue;
    const ar = bw / bh;
    if (ar < 0.6 || ar > 1.7) continue;
    const fill = c.area / (bw * bh);
    if (fill < 0.18 || fill > 0.85) continue;
    const cy = (c.minY + c.maxY) >> 1;
    const cx = (c.minX + c.maxX) >> 1;
    // expand the scanline a little past the bbox so edge transitions count too
    const x0 = Math.max(0, c.minX - 1);
    const x1 = Math.min(w - 1, c.maxX + 1);
    const y0 = Math.max(0, c.minY - 1);
    const y1 = Math.min(h - 1, c.maxY + 1);
    if (rowTransitions(bin, w, cy, x0, x1) < 4) continue;
    if (colTransitions(bin, w, cx, y0, y1) < 4) continue;
    cands.push({ x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2, r: (bw + bh) / 4, area: c.area });
  }
  cands.sort((a, b) => b.area - a.area);
  return cands.slice(0, maxCand);
}
