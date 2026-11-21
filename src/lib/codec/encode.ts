import { crc32 } from "./crc32";
import { rsEncode } from "./rs";
import {
  BLOCK_DATA,
  CRC_BYTES,
  MAGIC,
  MAX_PAYLOAD,
  PREFIX_BYTES,
  VERSION,
  type EccLevel,
  type StyleId,
  frameLayout,
  nsymFor,
  packMeta,
} from "./format";

export interface EncodeResult {
  /** Full codeword stream: prefix + RS-protected blocks. */
  codewords: Uint8Array;
  payloadLen: number;
  totalBytes: number;
  ecc: EccLevel;
  style: StyleId;
}

export function encodeText(text: string, style: StyleId, ecc: EccLevel): EncodeResult {
  const payload = new TextEncoder().encode(text);
  if (payload.length === 0) throw new Error("Text is empty");
  if (payload.length > MAX_PAYLOAD) throw new Error("Text too long");

  const prefix = new Uint8Array(PREFIX_BYTES);
  prefix[0] = MAGIC;
  prefix[1] = VERSION;
  prefix[2] = packMeta(style, ecc, payload.length);
  prefix[3] = payload.length & 0xff;

  const crcInput = new Uint8Array(PREFIX_BYTES + payload.length);
  crcInput.set(prefix);
  crcInput.set(payload, PREFIX_BYTES);
  const crc = crc32(crcInput);

  const { blocks, bodyBytes, totalBytes } = frameLayout(payload.length, ecc);

  const body = new Uint8Array(bodyBytes);
  body.set(payload);
  body[payload.length] = (crc >>> 24) & 0xff;
  body[payload.length + 1] = (crc >>> 16) & 0xff;
  body[payload.length + 2] = (crc >>> 8) & 0xff;
  body[payload.length + 3] = crc & 0xff;

  const codewords = new Uint8Array(totalBytes);
  codewords.set(prefix);
  let off = PREFIX_BYTES;
  for (let b = 0; b < blocks; b++) {
    const chunkLen = Math.min(BLOCK_DATA, bodyBytes - b * BLOCK_DATA);
    const chunk = body.subarray(b * BLOCK_DATA, b * BLOCK_DATA + chunkLen);
    const encoded = rsEncode(chunk, nsymFor(chunkLen, ecc));
    codewords.set(encoded, off);
    off += encoded.length;
  }

  return { codewords, payloadLen: payload.length, totalBytes, ecc, style };
}

/** Largest payload (bytes) that fits in `moduleBits` modules for the given ECC level. */
export function maxPayloadFor(moduleBits: number, ecc: EccLevel): number {
  const totalBytes = Math.floor(moduleBits / 8);
  for (let len = Math.min(MAX_PAYLOAD, 512); len >= 1; len--) {
    if (frameLayout(len, ecc).totalBytes <= totalBytes) return len;
  }
  return 0;
}
