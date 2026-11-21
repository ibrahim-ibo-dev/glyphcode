import { describe, expect, it } from "vitest";
import { crc32 } from "@/lib/codec/crc32";
import { rsDecode, rsEncode } from "@/lib/codec/rs";
import { encodeText, maxPayloadFor } from "@/lib/codec/encode";
import { decodeCodewords } from "@/lib/codec/decode";
import { bitsToBytes, bytesToBits, padBits } from "@/lib/codec/bits";
import type { EccLevel, StyleId } from "@/lib/codec/format";

describe("crc32", () => {
  it("matches the standard check vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("reed-solomon", () => {
  it("round-trips clean data", () => {
    const msg = Uint8Array.from({ length: 120 }, (_, i) => (i * 7) & 0xff);
    const enc = rsEncode(msg, 24);
    expect(enc.length).toBe(144);
    const dec = rsDecode(enc, 24);
    expect(Array.from(dec.subarray(0, 120))).toEqual(Array.from(msg));
  });

  it("corrects up to nsym/2 corrupted bytes", () => {
    const msg = Uint8Array.from({ length: 150 }, (_, i) => (i * 13 + 5) & 0xff);
    const enc = rsEncode(msg, 24);
    const corrupted = enc.slice();
    for (const pos of [3, 40, 99, 140, 55, 12, 77, 130, 20, 88, 33, 145]) {
      corrupted[pos] ^= 0xa5; // 12 errors = nsym/2
    }
    const dec = rsDecode(corrupted, 24);
    expect(Array.from(dec.subarray(0, 150))).toEqual(Array.from(msg));
  });

  it("throws when damage exceeds capacity", () => {
    const msg = Uint8Array.from({ length: 100 }, (_, i) => i & 0xff);
    const enc = rsEncode(msg, 10);
    const corrupted = enc.slice();
    for (let i = 0; i < 30; i++) corrupted[i * 3] ^= 0xff;
    expect(() => rsDecode(corrupted, 10)).toThrow();
  });
});

describe("bit helpers", () => {
  it("bytes->bits->bytes round-trip", () => {
    const b = new TextEncoder().encode("Hi سڵاو");
    expect(Array.from(bitsToBytes(bytesToBits(b)))).toEqual(Array.from(b));
  });
  it("pads deterministically", () => {
    const padded = padBits(bytesToBits(new Uint8Array([0x12])), 24);
    expect(padded.length).toBe(24);
  });
});

const CASES = [
  "Hello World",
  "HELLO",
  "1234567890",
  "سڵاو کوردستان",
  "ئەمە تاقیکردنەوەی سیستەمەکەیە.",
  "سڵاو Kurdistan 123 ❤️",
  "سڵاو کوردستان ❤️",
  "!@#$%^&*()_+-=[]{}|;':\",./<>?",
  "مرحبا بالعالم",
  "A",
  "The quick brown fox jumps over the lazy dog. 0123456789",
];

const ECCS: EccLevel[] = ["low", "medium", "high", "max"];
const STYLES: StyleId[] = ["wave", "circle", "spiral", "leaf"];

describe("frame encode/decode", () => {
  it.each(CASES)("round-trips %j", (text) => {
    for (const style of STYLES) {
      for (const ecc of ECCS) {
        const { codewords } = encodeText(text, style, ecc);
        const res = decodeCodewords(codewords);
        expect(res.text).toBe(text);
        expect(res.style).toBe(style);
        expect(res.ecc).toBe(ecc);
      }
    }
  });

  it("survives scattered bit errors within ECC capacity", () => {
    const { codewords } = encodeText("سڵاو کوردستان ❤️", "circle", "high");
    const bad = codewords.slice();
    // corrupt 10 bytes spread over the protected region
    for (const pos of [6, 15, 30, 60, 90, 120, 45, 75, 20, 100]) {
      if (pos < bad.length) bad[pos] ^= 0x5c;
    }
    const res = decodeCodewords(bad);
    expect(res.text).toBe("سڵاو کوردستان ❤️");
  });

  it("rejects garbage that is not a code", () => {
    const junk = Uint8Array.from({ length: 200 }, (_, i) => (i * 31) & 0xff);
    expect(() => decodeCodewords(junk)).toThrow();
  });

  it("computes sane capacity numbers", () => {
    expect(maxPayloadFor(2048, "low")).toBeGreaterThan(100);
    expect(maxPayloadFor(2048, "low")).toBeGreaterThan(maxPayloadFor(2048, "max"));
    expect(maxPayloadFor(16, "max")).toBe(0);
  });
});
