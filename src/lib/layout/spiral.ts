import type { Layout, Prim, Probe, Vec } from "./types";
import { bullseye } from "./types";

/**
 * SPIRAL style.
 *
 * Dots are placed at equal arc-length intervals along an Archimedean
 * spiral growing out of the central bullseye — a "dotted spiral" whose
 * every dot is a data bit. Same finder pair as CIRCLE: centre bullseye
 * for position+scale, satellite bullseye for rotation.
 */

const S = 1000;
const CX = 500;
const CY = 500;
const R_START = 92;
const R_END = 384;
const PITCH = 10.5;
const DOT = 4.4;

export const TURN_MIN = 3;
export const TURN_MAX = 10;
export const TURN_DEFAULT = 9;

export interface SpiralGeom {
  CX: number;
  CY: number;
  R_START: number;
  R_END: number;
  ARM: number;
  A: number;
  THETA_END: number;
  PITCH: number;
  turns: number;
}

/**
 * Geometry for a spiral with the requested number of turns. More turns =>
 * tighter winding and more capacity; fewer turns => a looser, shorter
 * spiral. The arm spacing adjusts so the spiral always fills the disc.
 */
export function spiralGeom(turns = TURN_DEFAULT): SpiralGeom {
  const t = Math.max(TURN_MIN, Math.min(TURN_MAX, Math.round(turns)));
  const ARM = (R_END - R_START) / t;
  return { CX, CY, R_START, R_END, ARM, A: ARM / (2 * Math.PI), THETA_END: t * 2 * Math.PI, PITCH, turns: t };
}

/** Spiral constants shared with the wavespiral style. */
export const SPIRAL = spiralGeom(TURN_DEFAULT);

/**
 * Module points at equal arc-length intervals, emitted at CELL CENTRES
 * (t = (k+0.5)*PITCH) so per-cell transitions never overlap a probe.
 */
export function spiralPathPoints(turns = TURN_DEFAULT): Vec[] {
  const g = spiralGeom(turns);
  const pts: Vec[] = [];
  let prev: Vec | null = null;
  let acc = 0;
  let next = PITCH / 2;
  const dTheta = 0.002;
  for (let th = 0; th <= g.THETA_END; th += dTheta) {
    const r = R_START + g.A * th;
    const p = { x: CX + r * Math.cos(th), y: CY + r * Math.sin(th) };
    if (prev) acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    if (acc >= next) {
      pts.push(p);
      next += PITCH;
    }
    prev = p;
  }
  return pts;
}

const cache = new Map<number, Vec[]>();
function points(turns = TURN_DEFAULT): Vec[] {
  const t = Math.max(TURN_MIN, Math.min(TURN_MAX, Math.round(turns)));
  let p = cache.get(t);
  if (!p) {
    p = spiralPathPoints(t);
    cache.set(t, p);
  }
  return p;
}

export function spiralLayout(turns = TURN_DEFAULT): Layout {
  const probes: Probe[] = points(turns).map((p) => ({ kind: "presence", p }));
  return {
    style: "spiral",
    width: S,
    height: S,
    markers: [
      { x: CX, y: CY },
      { x: CX + 430, y: CY },
    ],
    markerRadii: [42, 20],
    bitCount: probes.length,
    probes,
    pitch: PITCH,
  };
}

export function spiralPrims(bits: ArrayLike<number>, turns = TURN_DEFAULT): Prim[] {
  const layout = spiralLayout(turns);
  const prims: Prim[] = [
    ...bullseye(CX, CY, 42),
    ...bullseye(CX + 430, CY, 20),
    // faint full spiral arm for readability of the form
    { t: "poly", pts: spiralGuide(turns), w: 1.5, tone: "gray" },
  ];
  const pts = points(turns);
  pts.forEach((p, i) => {
    if (bits[i]) prims.push({ t: "disc", x: p.x, y: p.y, r: DOT });
  });
  return prims;
}

function spiralGuide(turns = TURN_DEFAULT): Vec[] {
  const g = spiralGeom(turns);
  const pts: Vec[] = [];
  for (let th = 0; th <= g.THETA_END; th += 0.01) {
    const r = R_START + g.A * th;
    pts.push({ x: CX + r * Math.cos(th), y: CY + r * Math.sin(th) });
  }
  return pts;
}
