import type { Layout, Prim, Probe } from "./types";
import { bullseye } from "./types";

/**
 * CIRCLE style.
 *
 * Data lives on concentric rings of dots around a central bullseye.
 * A second smaller bullseye at angle 0 (the "satellite") fixes rotation:
 *
 *          satellite
 *              ●
 *      ○ ○ ○ ○ ○ ○
 *    ○   ○ ○ ○ ○   ○
 *   ○  ○   ◉ ◉    ○  ○
 *    ○   ○ ○ ○ ○   ○
 *      ○ ○ ○ ○ ○ ○
 *
 * The centre bullseye gives position+scale, the satellite gives rotation,
 * and each ring's dots are read as presence/absence bits.
 */

const S = 1000;
const CX = 500;
const CY = 500;
const R0 = 100;
const R_END = 380;
const PITCH = 10;
const DOT = 4.6;

export const RING_MIN = 4;
export const RING_MAX = 11;
export const RING_DEFAULT = 9;

/**
 * Ring radii for a ring count. Fewer rings => a smaller, airier circle;
 * more rings => a fuller circle and more capacity. The outer radius is
 * capped just inside the satellite marker's inner edge.
 */
export function ringRadii(rings = RING_DEFAULT): number[] {
  const n = Math.max(RING_MIN, Math.min(RING_MAX, Math.round(rings)));
  const step = Math.min(70, (R_END - R0) / (n - 1));
  return Array.from({ length: n }, (_, i) => R0 + i * step);
}

export function circleLayout(rings = RING_DEFAULT): Layout {
  const radii = ringRadii(rings);
  const probes: Probe[] = [];
  for (const r of radii) {
    const m = Math.floor((2 * Math.PI * r) / PITCH);
    for (let j = 0; j < m; j++) {
      const a = (j * 2 * Math.PI) / m;
      probes.push({ kind: "presence", p: { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) } });
    }
  }
  return {
    style: "circle",
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

export function circlePrims(bits: ArrayLike<number>, rings = RING_DEFAULT): Prim[] {
  const layout = circleLayout(rings);
  const prims: Prim[] = [
    ...bullseye(CX, CY, 42),
    ...bullseye(CX + 430, CY, 20),
  ];
  for (const r of ringRadii(rings)) {
    prims.push({ t: "ring", x: CX, y: CY, r, w: 1, tone: "gray" });
  }
  layout.probes.forEach((pr, i) => {
    if (bits[i] && pr.kind === "presence") prims.push({ t: "disc", x: pr.p.x, y: pr.p.y, r: DOT });
  });
  return prims;
}
