import { crc32 } from "./crc32";
import { rsDecode } from "./rs";
import {
  BLOCK_DATA,
  CRC_BYTES,
  MAGIC,
  PREFIX_BYTES,
  VERSION,
  type EccLevel,
  type StyleId,
  frameLayout,
  nsymFor,
  unpackMeta,
} from "./format";

export interface DecodeResult {
  text: string;
  style: StyleId;
  ecc: EccLevel;
  payloadLen: number;
}

/**
 * Decode a codeword byte stream produced by encodeText (possibly with
 * errors — RS will repair them). Throws on structural failure.
 */
export function decodeCodewords(codewords: Uint8Array): DecodeResult {
  if (codewords.length < PREFIX_BYTES + 1) throw new Error("not enough data");
  if (codewords[0] !== MAGIC) throw new Error("bad magic");
  if (codewords[1] !== VERSION) throw new Error("bad version");
  const meta = unpackMeta(codewords[2]);
  if (!meta) throw new Error("bad meta");
  const payloadLen = (meta.lenHi << 8) | codewords[3];
  const { style, ecc } = meta;

  const { blocks, bodyBytes, totalBytes } = frameLayout(payloadLen, ecc);
  if (codewords.length < totalBytes) throw new Error("truncated codeword stream");

  const body = new Uint8Array(bodyBytes);
  let off = PREFIX_BYTES;
  let out = 0;
  for (let b = 0; b < blocks; b++) {
    const chunkLen = Math.min(BLOCK_DATA, bodyBytes - b * BLOCK_DATA);
    const nsym = nsymFor(chunkLen, ecc);
    const cw = codewords.subarray(off, off + chunkLen + nsym);
    const corrected = rsDecode(cw, nsym); // throws if beyond repair
    body.set(corrected.subarray(0, chunkLen), out);
    out += chunkLen;
    off += chunkLen + nsym;
  }

  const payload = body.subarray(0, payloadLen);
  const expectedCrc =
    ((body[payloadLen] << 24) | (body[payloadLen + 1] << 16) | (body[payloadLen + 2] << 8) | body[payloadLen + 3]) >>> 0;

  const crcInput = new Uint8Array(PREFIX_BYTES + payloadLen);
  crcInput.set(codewords.subarray(0, PREFIX_BYTES));
  crcInput.set(payload, PREFIX_BYTES);
  if (crc32(crcInput) !== expectedCrc) throw new Error("crc mismatch");

  const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  return { text, style, ecc, payloadLen };
}
