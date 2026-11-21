import type { Layout, Prim, Probe, Vec } from "./types";
import { bullseye } from "./types";

/**
 * LEAF style.
 *
 * A leaf silhouette (two arcs + central vein) carries a field of small
 * dots filling its interior — like vein-nodules. Each dot is a
 * presence/absence bit. Dots near the vein line are skipped so vein ink
 * can never masquerade as data.
 *
 * The silhouette is a RENDER variant — pick the leaf shape of a
 * different tree (willow-like slender, apple, lobed plane-tree/chenar).
 * The scanner tries each variant; the frame's CRC decides.
 *
 *   stem ●─── tip  markers at both ends give axis, scale and rotation.
 */

export type LeafVariant = "slender" | "apple" | "chenar";
export const LEAF_VARIANTS: LeafVariant[] = ["slender", "apple", "chenar"];

const W = 2000;
const H = 1120;
const VEIN_Y = H / 2;
const TIP_X0 = 190;
const TIP_X1 = 1810;
const COL_STEP = 17;
const ROW_STEP = 15;
const DOT = 5.0;

function tOf(x: number): number {
  return Math.min(1, Math.max(0, (x - TIP_X0) / (TIP_X1 - TIP_X0)));
}

/** Half-width of the leaf silhouette at x, per tree variant. */
export function leafHalfWidth(variant: LeafVariant, x: number): number {
  const t = tOf(x);
  switch (variant) {
    case "apple":
      // ovate: broad toward the stem, tapering to the tip
      return 390 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.82)), 0.85);
    case "chenar": {
      // plane-tree: palmate lobes = broad envelope modulated into 3 lobes
      const env = Math.pow(Math.sin(Math.PI * t), 0.85);
      const lobes = 1 + 0.38 * Math.cos(4 * Math.PI * t - Math.PI / 2);
      return 320 * env * Math.max(0.18, lobes);
    }
    case "slender":
    default:
      // willow-like ellipse
      return 375 * Math.pow(Math.sin(Math.PI * t), 0.9);
  }
}

export function leafLayout(variant: LeafVariant = "slender"): Layout {
  const probes: Probe[] = [];
  for (let x = 235; x <= 1765; x += COL_STEP) {
    const hw = leafHalfWidth(variant, x) * 0.82;
    for (let off = -hw; off <= hw; off += ROW_STEP) {
      if (Math.abs(off) < 10) continue; // keep clear of the vein
      probes.push({ kind: "presence", p: { x, y: VEIN_Y + off } });
    }
  }
  return {
    style: "leaf",
    width: W,
    height: H,
    markers: [
      { x: 95, y: VEIN_Y },
      { x: W - 95, y: VEIN_Y },
    ],
    markerRadii: [32, 32],
    bitCount: probes.length,
    probes,
    pitch: ROW_STEP,
  };
}

export function leafPrims(bits: ArrayLike<number>, variant: LeafVariant = "slender"): Prim[] {
  const layout = leafLayout(variant);
  const [m1, m2] = layout.markers;
  const prims: Prim[] = [...bullseye(m1.x, m1.y, 32), ...bullseye(m2.x, m2.y, 32)];

  const upper: Vec[] = [];
  const lower: Vec[] = [];
  for (let x = TIP_X0; x <= TIP_X1; x += 8) {
    const hw = leafHalfWidth(variant, x);
    upper.push({ x, y: VEIN_Y - hw });
    lower.push({ x, y: VEIN_Y + hw });
  }
  prims.push({ t: "poly", pts: upper, w: 5 });
  prims.push({ t: "poly", pts: lower, w: 5 });
  prims.push({ t: "poly", pts: [{ x: 150, y: VEIN_Y }, { x: 1850, y: VEIN_Y }], w: 5 });

  layout.probes.forEach((pr, i) => {
    if (bits[i] && pr.kind === "presence") prims.push({ t: "disc", x: pr.p.x, y: pr.p.y, r: DOT });
  });
  return prims;
}
