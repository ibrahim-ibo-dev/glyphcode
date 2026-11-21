import type { StyleId } from "../codec/format";
import type { Layout, Prim } from "./types";
import { waveLayout, wavePrims, WAVE_MAX_ROWS, WAVE_PATTERNS, type WavePattern } from "./wave";
import { circleLayout, circlePrims, RING_MIN, RING_MAX, RING_DEFAULT } from "./circle";
import { spiralLayout, spiralPrims, TURN_MIN, TURN_MAX, TURN_DEFAULT } from "./spiral";
import { leafLayout, leafPrims, LEAF_VARIANTS, type LeafVariant } from "./leaf";
import { waveCircleLayout, waveCirclePrims } from "./wavecircle";
import { waveSpiralLayout, waveSpiralPrims } from "./wavespiral";

/** Render-time options. None of these change the binary format. */
export interface RenderOpts {
  /** wave: number of waveband rows (1..13) */
  waveRows?: number;
  /** wave/wavecircle/wavespiral: stroke width */
  thickness?: number;
  /** wave/wavecircle/wavespiral: excursion pattern per cell */
  pattern?: WavePattern;
  /** leaf: silhouette variant */
  leafVariant?: LeafVariant;
  /** circle/wavecircle: ring count — fewer = smaller circle, more = fuller */
  rings?: number;
  /** spiral/wavespiral: turn count — fewer = looser, more = tighter */
  turns?: number;
}

export type { WavePattern, LeafVariant };
export { LEAF_VARIANTS, WAVE_MAX_ROWS, WAVE_PATTERNS, RING_MIN, RING_MAX, RING_DEFAULT, TURN_MIN, TURN_MAX, TURN_DEFAULT };

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export function getLayout(style: StyleId, opts: RenderOpts = {}): Layout {
  switch (style) {
    case "wave":
      return waveLayout(opts.waveRows);
    case "circle":
      return circleLayout(opts.rings);
    case "spiral":
      return spiralLayout(opts.turns);
    case "leaf":
      return leafLayout(opts.leafVariant);
    case "wavecircle":
      return waveCircleLayout(opts.rings);
    case "wavespiral":
      return waveSpiralLayout(opts.turns);
  }
}

/**
 * Every layout hypothesis the scanner should try for a style.
 * Render variants that move data modules (wave rows, leaf silhouette,
 * ring count, turn count) get one entry each; the frame's MAGIC+CRC
 * picks the right one. Stroke thickness and excursion pattern never
 * move module centres, so they need no variants.
 */
export function getLayoutVariants(style: StyleId): Layout[] {
  switch (style) {
    case "wave":
      return Array.from({ length: WAVE_MAX_ROWS }, (_, i) => waveLayout(i + 1));
    case "leaf":
      return LEAF_VARIANTS.map((v) => leafLayout(v));
    case "circle":
      return range(RING_MIN, RING_MAX).map(circleLayout);
    case "wavecircle":
      return range(RING_MIN, RING_MAX).map(waveCircleLayout);
    case "spiral":
      return range(TURN_MIN, TURN_MAX).map(spiralLayout);
    case "wavespiral":
      return range(TURN_MIN, TURN_MAX).map(waveSpiralLayout);
    default:
      return [getLayout(style)];
  }
}

export function buildPrims(style: StyleId, bits: ArrayLike<number>, opts: RenderOpts = {}): Prim[] {
  switch (style) {
    case "wave":
      return wavePrims(bits, { rows: opts.waveRows, thickness: opts.thickness, pattern: opts.pattern });
    case "circle":
      return circlePrims(bits, opts.rings);
    case "spiral":
      return spiralPrims(bits, opts.turns);
    case "leaf":
      return leafPrims(bits, opts.leafVariant);
    case "wavecircle":
      return waveCirclePrims(bits, { thickness: opts.thickness, pattern: opts.pattern, rings: opts.rings });
    case "wavespiral":
      return waveSpiralPrims(bits, { thickness: opts.thickness, pattern: opts.pattern, turns: opts.turns });
  }
}

export const ALL_STYLES: StyleId[] = ["wave", "circle", "spiral", "leaf", "wavecircle", "wavespiral"];
