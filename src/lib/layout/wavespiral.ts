import type { Layout, Prim, Probe, Vec } from "./types";
import { bullseye } from "./types";
import { spiralGeom, spiralPathPoints, TURN_DEFAULT, type SpiralGeom } from "./spiral";
import { waveShape, type WavePattern } from "./wave";

/**
 * WAVESPIRAL style — Spiral geometry rendered as a wavy arm.
 *
 * An Archimedean spiral grows out of the centre bullseye like SPIRAL,
 * but the arm is a continuous wavy line: around each data cell it bulges
 * OUTWARD (1) or INWARD (0) radially. The scanner reads the radial ink
 * centroid at each cell centre. Finder pair: centre + satellite bullseyes.
 *
 * Render options (do NOT affect the decoder):
 *  - turns: number of winds — fewer = looser spiral, more = tighter/fuller
 *  - thickness: stroke width
 *  - pattern: same excursion shapes as WAVE
 */

const AMP = 8;

export interface WaveSpiralOpts {
  thickness?: number;
  pattern?: WavePattern;
  turns?: number;
}

export function waveSpiralLayout(turns = TURN_DEFAULT): Layout {
  const g = spiralGeom(turns);
  const pts = spiralPathPoints(turns);
  const probes: Probe[] = pts.map((p) => {
    const dx = p.x - g.CX;
    const dy = p.y - g.CY;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    return {
      kind: "diff" as const,
      up: { x: p.x + ux * AMP, y: p.y + uy * AMP },
      down: { x: p.x - ux * AMP, y: p.y - uy * AMP },
      // tangent = perpendicular to the radial direction
      half: { x: -uy * g.PITCH * 0.3, y: ux * g.PITCH * 0.3 },
    };
  });
  return {
    style: "wavespiral",
    width: 1000,
    height: 1000,
    markers: [
      { x: g.CX, y: g.CY },
      { x: g.CX + 430, y: g.CY },
    ],
    markerRadii: [42, 20],
    bitCount: probes.length,
    probes,
    pitch: g.PITCH,
  };
}

/**
 * Walk the spiral arm and emit the centre point, radial direction, cell
 * fraction t and plateau value s at each sample.
 */
function walkArm(
  g: SpiralGeom,
  pattern: WavePattern,
  level: (c: number) => number
): { q: Vec; ux: number; uy: number; s: number; cell: number; u: number }[] {
  const out: { q: Vec; ux: number; uy: number; s: number; cell: number; u: number }[] = [];
  let prev: Vec | null = null;
  let arc = 0;
  const dTheta = 0.004;
  for (let th = 0; th <= g.THETA_END; th += dTheta) {
    const rBase = g.R_START + g.A * th;
    const p = { x: g.CX + rBase * Math.cos(th), y: g.CY + rBase * Math.sin(th) };
    if (prev) arc += Math.hypot(p.x - prev.x, p.y - prev.y);
    const t = arc / g.PITCH;
    const cell = Math.floor(t);
    const u = t - cell;
    const s = waveShape(pattern, level, t, Number.MAX_SAFE_INTEGER);
    const d = Math.hypot(p.x - g.CX, p.y - g.CY) || 1;
    const ux = (p.x - g.CX) / d;
    const uy = (p.y - g.CY) / d;
    const rr = rBase + s * AMP;
    out.push({ q: { x: g.CX + rr * ux, y: g.CY + rr * uy }, ux, uy, s, cell, u });
    prev = p;
  }
  return out;
}

export function waveSpiralPrims(bits: ArrayLike<number>, opts: WaveSpiralOpts = {}): Prim[] {
  const pattern = opts.pattern ?? "smooth";
  const turns = opts.turns ?? TURN_DEFAULT;
  const g = spiralGeom(turns);
  // Cap the stroke so neighbouring arms always keep ~5px of clearance —
  // a thick stroke on a tight spiral would otherwise bridge turns into
  // one blob and hide the finder markers.
  const stroke = Math.max(2, Math.min(opts.thickness ?? 6, g.ARM - 2 * AMP - 5));
  const beadR = Math.max(3.5, Math.min(stroke * 0.9, 14, (g.ARM - 2 * AMP - 5) / 2));
  const prims: Prim[] = [
    ...bullseye(g.CX, g.CY, 42),
    ...bullseye(g.CX + 430, g.CY, 20),
  ];

  const level = (k: number) => (bits[Math.max(0, Math.min(bits.length - 1, k))] ? 1 : -1);

  if (pattern === "beads") {
    const pts = spiralPathPoints(turns);
    pts.forEach((p, i) => {
      const dx = p.x - g.CX;
      const dy = p.y - g.CY;
      const d = Math.hypot(dx, dy) || 1;
      const s = level(i);
      prims.push({
        t: "disc",
        x: p.x + (dx / d) * s * AMP,
        y: p.y + (dy / d) * s * AMP,
        r: beadR,
      });
    });
    prims.push({ t: "poly", pts: armGuide(g), w: 1.5, tone: "gray" });
    return prims;
  }

  const arm = walkArm(g, pattern === "ribbon" ? "smooth" : pattern, level);

  if (pattern === "ribbon") {
    const bh = Math.min(stroke, 10);
    const outer = arm.map((s) => ({ x: s.q.x + s.ux * bh, y: s.q.y + s.uy * bh }));
    const inner = arm.map((s) => ({ x: s.q.x - s.ux * bh, y: s.q.y - s.uy * bh }));
    prims.push({ t: "fill", pts: [...outer, ...inner.reverse()] });
    return prims;
  }

  if (pattern === "smooth") {
    // Split: thick plateau arcs, thin transitions at cell ends so a thick
    // stroke can never blanket a probe axis.
    let seg: Vec[] = [];
    let thin: Vec[] = [];
    const flush = () => {
      if (seg.length > 1) prims.push({ t: "poly", pts: seg, w: stroke });
      if (thin.length > 1) prims.push({ t: "poly", pts: thin, w: Math.min(stroke, 7) });
      seg = [];
      thin = [];
    };
    for (const s of arm) {
      const isTransition = s.u > 0.78 && level(s.cell) !== level(s.cell + 1);
      if (isTransition) {
        if (seg.length > 1) prims.push({ t: "poly", pts: seg, w: stroke });
        seg = [];
        thin.push(s.q);
      } else {
        if (thin.length > 1) prims.push({ t: "poly", pts: thin, w: Math.min(stroke, 7) });
        thin = [];
        seg.push(s.q);
      }
    }
    flush();
  } else {
    prims.push({ t: "poly", pts: arm.map((s) => s.q), w: stroke });
  }
  return prims;
}

function armGuide(g: SpiralGeom): Vec[] {
  const pts: Vec[] = [];
  for (let th = 0; th <= g.THETA_END; th += 0.01) {
    const r = g.R_START + g.A * th;
    pts.push({ x: g.CX + r * Math.cos(th), y: g.CY + r * Math.sin(th) });
  }
  return pts;
}
