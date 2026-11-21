import type { Layout, Prim, Probe, Vec } from "./types";
import { bullseye } from "./types";

/**
 * WAVE style.
 *
 * Bits ride a horizontal "waveband": R rows of a modulated wave.
 * A bit = 1 pushes the wave UP through that cell, 0 pushes it DOWN.
 * Two big bullseyes at the band ends are the sync structure:
 *
 *   [SYNC] ~~~ encoded wave ~~~ [SYNC]
 *
 * Reading is differential: the scanner walks the probe axis at the cell
 * centre and takes the ink centroid, so transition strokes between cells
 * can never confuse it.
 *
 * Render options (do NOT affect the decoder):
 *  - rows: 1..13 rows. Fewer rows => shorter code and smaller capacity —
 *    a single row carries only a few bytes, so it's for very short text.
 *  - thickness: stroke width of the wave line
 *  - pattern: shape of each cell's excursion — smooth | sine | triangle |
 *    pulse | swell | beads | ribbon
 *
 * For the "smooth" pattern, plateau segments are drawn at full thickness
 * but the steep transitions between cells are capped thin — a thick
 * vertical bar would otherwise blanket a probe column and look like ink
 * at BOTH levels at once.
 */

export type WavePattern = "smooth" | "sine" | "triangle" | "pulse" | "swell" | "beads" | "ribbon";

export const WAVE_PATTERNS: WavePattern[] = ["smooth", "sine", "triangle", "pulse", "swell", "beads", "ribbon"];

export interface WaveOpts {
  rows?: number;
  thickness?: number;
  pattern?: WavePattern;
}

const AMP = 24;
const SPACING = 70;
const CELL_PITCH = 10.6;
const TRANSITION_CAP = 7; // max stroke width for inter-cell transitions
export const WAVE_MAX_ROWS = 13;

export function waveDims(rows: number): {
  w: number;
  h: number;
  x0: number;
  x1: number;
  cols: number;
  cellW: number;
  rowY: (i: number) => number;
} {
  const w = 2000;
  const x0 = 175;
  const x1 = w - 175;
  const cols = Math.floor((x1 - x0) / CELL_PITCH);
  const cellW = (x1 - x0) / cols;
  const span = (rows - 1) * SPACING;
  const h = Math.max(320, span + 240);
  return { w, h, x0, x1, cols, cellW, rowY: (i: number) => h / 2 + (i - (rows - 1) / 2) * SPACING };
}

export function waveLayout(rows = WAVE_MAX_ROWS): Layout {
  const d = waveDims(rows);
  const probes: Probe[] = [];
  for (let r = 0; r < rows; r++) {
    const y = d.rowY(r);
    for (let c = 0; c < d.cols; c++) {
      const x = d.x0 + (c + 0.5) * d.cellW;
      probes.push({
        kind: "diff",
        up: { x, y: y - AMP },
        down: { x, y: y + AMP },
        half: { x: d.cellW * 0.28, y: 0 },
      });
    }
  }
  return {
    style: "wave",
    width: d.w,
    height: d.h,
    markers: [
      { x: 80, y: d.h / 2 },
      { x: d.w - 80, y: d.h / 2 },
    ],
    markerRadii: [38, 38],
    bitCount: probes.length,
    probes,
    pitch: d.cellW,
  };
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Excursion s(t) in [-1,1] for a cell with fraction u and current/next levels. */
export function waveShape(pattern: WavePattern, level: (c: number) => number, t: number, cols: number): number {
  if (t < 0) return level(0);
  if (t >= cols) return level(cols - 1);
  const i = Math.floor(t);
  const u = t - i;
  switch (pattern) {
    case "sine":
      return level(i) * Math.sin(Math.PI * u);
    case "triangle":
      return level(i) * (1 - Math.abs(2 * u - 1));
    case "pulse":
      return level(i) * smoothstep((u - 0.28) / 0.07) * smoothstep((0.72 - u) / 0.07);
    case "swell":
      return level(i) * smoothstep(u / 0.32) * smoothstep((1 - u) / 0.32);
    case "smooth":
    default:
      if (u <= 0.78 || i === cols - 1) return level(i);
      return level(i) * (1 - smoothstep((u - 0.78) / 0.22)) + level(i + 1) * smoothstep((u - 0.78) / 0.22);
  }
}

export function wavePrims(bits: ArrayLike<number>, opts: WaveOpts = {}): Prim[] {
  const rows = Math.min(WAVE_MAX_ROWS, Math.max(1, opts.rows ?? WAVE_MAX_ROWS));
  const stroke = opts.thickness ?? 9;
  const pattern = opts.pattern ?? "smooth";
  const d = waveDims(rows);
  const layout = waveLayout(rows);

  const prims: Prim[] = [];
  const [m1, m2] = layout.markers;
  prims.push(...bullseye(m1.x, m1.y, 38), ...bullseye(m2.x, m2.y, 38));

  for (let r = 0; r < rows; r++) {
    const y = d.rowY(r);
    prims.push({ t: "poly", pts: [{ x: d.x0 - 20, y }, { x: d.x1 + 20, y }], w: 1.5, tone: "gray" });

    const level = (c: number) => (bits[r * d.cols + c] ? 1 : -1);

    if (pattern === "beads") {
      // A pearl per cell, pushed up/down by its bit.
      for (let c = 0; c < d.cols; c++) {
        const x = d.x0 + (c + 0.5) * d.cellW;
        prims.push({ t: "disc", x, y: y - level(c) * AMP, r: Math.max(4, stroke * 0.9) });
      }
    } else if (pattern === "ribbon") {
      // A solid flowing band following the smooth excursion.
      const bh = Math.min(stroke, 14); // keep clear of neighbouring rows
      const top: Vec[] = [];
      const bot: Vec[] = [];
      for (let x = d.x0 - 14; x <= d.x1 + 14; x += 2) {
        const yc = y - waveShape("smooth", level, (x - d.x0) / d.cellW, d.cols) * AMP;
        top.push({ x, y: yc - bh });
        bot.push({ x, y: yc + bh });
      }
      prims.push({ t: "fill", pts: [...top, ...bot.reverse()] });
    } else if (pattern === "smooth") {
      // Split: thick plateau segments, thin transition ramps.
      let seg: Vec[] = [];
      let thin: Vec[] = [];
      const flushThick = () => {
        if (seg.length > 1) prims.push({ t: "poly", pts: seg, w: stroke });
        seg = [];
      };
      const flushThin = () => {
        if (thin.length > 1) prims.push({ t: "poly", pts: thin, w: Math.min(stroke, TRANSITION_CAP) });
        thin = [];
      };
      for (let x = d.x0 - 14; x <= d.x1 + 14; x += 2) {
        const t = (x - d.x0) / d.cellW;
        const s = waveShape("smooth", level, t, d.cols);
        const i = Math.floor(Math.min(d.cols - 1, Math.max(0, t)));
        const u = Math.min(1, Math.max(0, t - i));
        const inTransition = u > 0.78 && i < d.cols - 1 && level(i) !== level(i + 1);
        const p = { x, y: y - s * AMP };
        if (inTransition) {
          flushThick();
          thin.push(p);
        } else {
          flushThin();
          seg.push(p);
        }
      }
      flushThick();
      flushThin();
    } else {
      const pts: Vec[] = [];
      for (let x = d.x0 - 14; x <= d.x1 + 14; x += 2) {
        pts.push({ x, y: y - waveShape(pattern, level, (x - d.x0) / d.cellW, d.cols) * AMP });
      }
      prims.push({ t: "poly", pts, w: stroke });
    }
  }
  return prims;
}
