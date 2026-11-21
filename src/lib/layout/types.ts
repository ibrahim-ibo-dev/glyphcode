import type { StyleId } from "../codec/format";

export interface Vec {
  x: number;
  y: number;
}

/**
 * How the scanner reads one bit.
 * - presence: dark ink at `p` means 1.
 * - diff: the bit is positional. `up` and `down` are the two plateau
 *   centres; `half` is the in-cell half-extent along the wave direction,
 *   sized so the sampling window stays clear of cell-boundary
 *   transitions. The scanner integrates ink over the 2D box spanned by
 *   (up->down) x (+-half) and takes the centroid along the axis.
 */
export type Probe =
  | { kind: "presence"; p: Vec }
  | { kind: "diff"; up: Vec; down: Vec; half: Vec };

/**
 * A style layout is the single source of truth for where every finder
 * marker and every data module lives in canonical coordinates. The
 * renderer draws it and the scanner samples it — same code path.
 */
export interface Layout {
  style: StyleId;
  width: number;
  height: number;
  /** Two finder bullseyes, ordered (m1 -> m2 defines +axis / orientation). */
  markers: [Vec, Vec];
  markerRadii: [number, number];
  bitCount: number;
  probes: Probe[];
  /** Nominal distance between adjacent modules, for scanner patch sizing. */
  pitch: number;
}

/** Rendering primitive. `tone`: dark = data ink, gray = decoration, light = knockout. */
export type Prim =
  | { t: "disc"; x: number; y: number; r: number; tone?: "dark" | "light" | "gray" }
  | { t: "ring"; x: number; y: number; r: number; w: number; tone?: "dark" | "light" | "gray" }
  | { t: "poly"; pts: Vec[]; w: number; tone?: "dark" | "light" | "gray" }
  | { t: "fill"; pts: Vec[]; tone?: "dark" | "light" | "gray" };

/** Standard finder bullseye: dark ring / light gap / dark core. */
export function bullseye(x: number, y: number, r: number): Prim[] {
  return [
    { t: "disc", x, y, r },
    { t: "disc", x, y, r: r * 0.66, tone: "light" },
    { t: "disc", x, y, r: r * 0.4 },
  ];
}
