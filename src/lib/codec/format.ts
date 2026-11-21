/**
 * GlyphCode binary frame format.
 *
 * A frame is a byte sequence laid out as:
 *
 *   ┌──────────── RAW PREFIX (4 bytes, not RS protected) ────────────┐
 *   │ MAGIC   (1B) = 0xE7                                           │
 *   │ VERSION (1B) = 0x01                                           │
 *   │ META    (1B) = style:3 bits (hi) | ecc:2 bits | lenHi:3 bits    │
 *   │ LEN_LO  (1B) = payload length low byte                        │
 *   └───────────────────────────────────────────────────────────────┘
 *   ┌──────────── RS-PROTECTED BODY ─────────────────────────────────┐
 *   │ PAYLOAD (LEN bytes, UTF-8)                                    │
 *   │ CRC32   (4B, IEEE, over prefix+payload)                       │
 *   │ RS parity for block 0 (NSYM bytes)                            │
 *   │ ...more blocks: (data chunk | NSYM parity) each ...           │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * The body is split into RS blocks of at most BLOCK_DATA bytes; every
 * block is independently protected by NSYM parity symbols so a damaged
 * region only threatens one block.
 *
 * LEN is 11 bits total (3 bits in META + 8 in LEN_LO) → max payload
 * 2047 bytes, but per-style module counts cap it far lower.
 */

export const MAGIC = 0xe7;
export const VERSION = 0x01;

export const PREFIX_BYTES = 4;
export const CRC_BYTES = 4;
export const BLOCK_DATA = 150; // data bytes per RS block (< 255 - max nsym)
export const MAX_PAYLOAD = 2047;

export const STYLE_CODES = {
  wave: 1,
  circle: 2,
  spiral: 3,
  leaf: 4,
  wavecircle: 5,
  wavespiral: 6,
} as const;

export type StyleId = keyof typeof STYLE_CODES;
export const STYLE_BY_CODE: Record<number, StyleId> = {
  1: "wave",
  2: "circle",
  3: "spiral",
  4: "leaf",
  5: "wavecircle",
  6: "wavespiral",
};

export const ECC_CODES = { low: 0, medium: 1, high: 2, max: 3 } as const;
export type EccLevel = keyof typeof ECC_CODES;
export const ECC_BY_CODE: Record<number, EccLevel> = {
  0: "low",
  1: "medium",
  2: "high",
  3: "max",
};

/**
 * Reed–Solomon parity per block, proportional to that block's data size
 * (so short frames aren't starved by a fixed overhead). Level ratios are
 * roughly the fraction of correctable damage: low ~7%, medium ~15%,
 * high ~27%, max ~42% of each block's data.
 */
const ECC_RATIO: Record<EccLevel, number> = { low: 0.15, medium: 0.32, high: 0.6, max: 0.95 };
const ECC_MIN: Record<EccLevel, number> = { low: 4, medium: 8, high: 12, max: 16 };

export function nsymFor(blockDataLen: number, ecc: EccLevel): number {
  const n = Math.max(ECC_MIN[ecc], Math.ceil(blockDataLen * ECC_RATIO[ecc]));
  return Math.min(n, 255 - blockDataLen);
}

export function packMeta(style: StyleId, ecc: EccLevel, len: number): number {
  return ((STYLE_CODES[style] & 0x7) << 5) | ((ECC_CODES[ecc] & 0x3) << 3) | ((len >> 8) & 0x7);
}

export function unpackMeta(meta: number): { style: StyleId; ecc: EccLevel; lenHi: number } | null {
  const style = STYLE_BY_CODE[(meta >> 5) & 0x7];
  const ecc = ECC_BY_CODE[(meta >> 3) & 0x3];
  if (!style || !ecc) return null;
  return { style, ecc, lenHi: meta & 0x7 };
}

/** Number of RS blocks and total codeword count for a given payload length. */
export function frameLayout(payloadLen: number, ecc: EccLevel): { blocks: number; bodyBytes: number; totalBytes: number } {
  const bodyBytes = payloadLen + CRC_BYTES;
  const blocks = Math.max(1, Math.ceil(bodyBytes / BLOCK_DATA));
  let parity = 0;
  for (let b = 0; b < blocks; b++) {
    const chunkLen = Math.min(BLOCK_DATA, bodyBytes - b * BLOCK_DATA);
    parity += nsymFor(chunkLen, ecc);
  }
  return { blocks, bodyBytes, totalBytes: PREFIX_BYTES + bodyBytes + parity };
}
