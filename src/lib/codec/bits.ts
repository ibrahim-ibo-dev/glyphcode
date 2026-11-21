/** Byte <-> bit helpers. Bit order is MSB-first within each byte. */

export function bytesToBits(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    for (let k = 0; k < 8; k++) bits[i * 8 + k] = (b >> (7 - k)) & 1;
  }
  return bits;
}

export function bitsToBytes(bits: ArrayLike<number>, bitCount = bits.length): Uint8Array {
  const n = Math.floor(bitCount / 8);
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i * 8 + k] & 1);
    bytes[i] = b;
  }
  return bytes;
}

/** Alternating padding used for unused modules, MSB-first. */
export function padBits(bits: Uint8Array, total: number): Uint8Array {
  if (bits.length >= total) return bits;
  const out = new Uint8Array(total);
  out.set(bits);
  for (let i = bits.length; i < total; i++) out[i] = i % 2 === 0 ? 1 : 0;
  return out;
}
