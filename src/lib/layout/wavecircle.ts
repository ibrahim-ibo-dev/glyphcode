import type { Layout, Prim, Probe, Vec } from "./types";
import { bullseye } from "./types";
import { ringRadii, RING_DEFAULT } from "./circle";
import { waveShape, type WavePattern } from "./wave";

/**
 * WAVECIRCLE style — Circle geometry rendered as waves.
 *
 * Same concentric-ring layout as CIRCLE, but each ring is a wavy line
 * instead of dots. Around each angular cell the ring bulges OUTWARD for
 * a 1 and INWARD for a 0. The scanner reads the radial ink centroid at
 * the cell's angular centre — identical machinery to WAVE, wrapped
 * around a circle. Finder pair: centre bullseye + satellite bullseye.
 *
 * Render options (do NOT affect the decoder):
 *  - rings: ring count — fewer = smaller/airier circle, more = fuller
 *  - thickness: stroke width
 *  - pattern: same excursion shapes as WAVE (sine ring = scalloped
 *    flower, triangle = zigzag sun, beads = pearl ring, ribbon = band)
 */

const S = 1000;
const CX = 500;
const CY = 500;
const PITCH = 10;
const AMP = 9;

export interface WaveCircleOpts {
  thickness?: number;
  pattern?: WavePattern;
  rings?: number;
}

export function waveCircleLayout(rings = RING_DEFAULT): Layout {
  const radii = ringRadii(rings);
  const probes: Probe[] = [];
  for (const r of radii) {
    const m = Math.floor((2 * Math.PI * r) / PITCH);
    for (let j = 0; j < m; j++) {
      const a = ((j + 0.5) * 2 * Math.PI) / m;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      probes.push({
        kind: "diff",
        up: { x: CX + (r + AMP) * cos, y: CY + (r + AMP) * sin },
        down: { x: CX + (r - AMP) * cos, y: CY + (r - AMP) * sin },
        // half-extent along the tangent, clear of cell boundaries
        half: { x: -sin * ((2 * Math.PI * r) / m) * 0.3, y: cos * ((2 * Math.PI * r) / m) * 0.3 },
      });
    }
  }
  return {
    style: "wavecircle",
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

export function waveCirclePrims(bits: ArrayLike<number>, opts: WaveCircleOpts = {}): Prim[] {
  const pattern = opts.pattern ?? "smooth";
  const rings = opts.rings ?? RING_DEFAULT;
  const radii = ringRadii(rings);
  // Cap the stroke so neighbouring rings always keep ~5px of clearance —
  // a thick stroke on dense rings would bridge them into one blob.
  const step = radii.length > 1 ? radii[1] - radii[0] : 70;
  const stroke = Math.max(2, Math.min(opts.thickness ?? 6, step - 2 * AMP - 5));
  const beadR = Math.max(3.5, Math.min(stroke * 0.9, 17, (step - 2 * AMP - 5) / 2));
  const prims: Prim[] = [
    ...bullseye(CX, CY, 42),
    ...bullseye(CX + 430, CY, 20),
  ];

  let bit = 0;
  for (const r of radii) {
    const m = Math.floor((2 * Math.PI * r) / PITCH);
    const level = (j: number) => (bits[bit + ((j % m) + m) % m] ? 1 : -1);
    const ringPt = (a: number, s: number, off = 0): Vec => ({
      x: CX + (r + s * AMP + off) * Math.cos(a),
      y: CY + (r + s * AMP + off) * Math.sin(a),
    });
    prims.push({ t: "ring", x: CX, y: CY, r, w: 1, tone: "gray" });

    if (pattern === "beads") {
      for (let j = 0; j < m; j++) {
        const a = ((j + 0.5) * 2 * Math.PI) / m;
        const p = ringPt(a, level(j));
        prims.push({ t: "disc", x: p.x, y: p.y, r: beadR });
      }
    } else if (pattern === "ribbon") {
      const bh = Math.min(stroke, 17);
      const outer: Vec[] = [];
      const inner: Vec[] = [];
      const total = m * 24;
      for (let k = 0; k <= total; k++) {
        const t = (k / total) * m;
        const s = waveShape("smooth", level, t, m);
        const a = (k / total) * 2 * Math.PI;
        outer.push(ringPt(a, s, bh));
        inner.push(ringPt(a, s, -bh));
      }
      prims.push({ t: "fill", pts: [...outer, ...inner.reverse()] });
    } else if (pattern === "smooth") {
      // Split: thick plateau arcs, thin radial transitions.
      let seg: Vec[] = [];
      let thin: Vec[] = [];
      const flush = () => {
        if (seg.length > 1) prims.push({ t: "poly", pts: seg, w: stroke });
        if (thin.length > 1) prims.push({ t: "poly", pts: thin, w: Math.min(stroke, 7) });
        seg = [];
        thin = [];
      };
      const total = m * 24;
      for (let k = 0; k <= total; k++) {
        const t = (k / total) * m;
        const j = Math.floor(t) % m;
        const u = t - Math.floor(t);
        const s = waveShape("smooth", level, t, m);
        const a = (k / total) * 2 * Math.PI;
        const p = ringPt(a, s);
        if (u > 0.78 && level(j) !== level(j + 1)) {
          if (seg.length > 1) prims.push({ t: "poly", pts: seg, w: stroke });
          seg = [];
          thin.push(p);
        } else {
          if (thin.length > 1) prims.push({ t: "poly", pts: thin, w: Math.min(stroke, 7) });
          thin = [];
          seg.push(p);
        }
      }
      flush();
    } else {
      const pts: Vec[] = [];
      const total = m * 24;
      for (let k = 0; k <= total; k++) {
        const t = (k / total) * m;
        const a = (k / total) * 2 * Math.PI;
        pts.push(ringPt(a, waveShape(pattern, level, t, m)));
      }
      prims.push({ t: "poly", pts, w: stroke });
    }
    bit += m;
  }
  return prims;
}
