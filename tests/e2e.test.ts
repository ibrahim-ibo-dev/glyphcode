import { describe, expect, it } from "vitest";
import { encodeText } from "@/lib/codec/encode";
import { bytesToBits, padBits } from "@/lib/codec/bits";
import { ALL_STYLES, buildPrims, getLayout, type RenderOpts } from "@/lib/layout";
import { decodeImage } from "@/lib/scan/pipeline";
import type { EccLevel, StyleId } from "@/lib/codec/format";
import { boxBlur, embed, noise, occlude, rasterize, reduceContrast, transform, type RGBA } from "./raster";

/** Render a code to a synthetic camera frame. */
function render(style: StyleId, text: string, ecc: EccLevel = "medium", scale = 0.55, opts: RenderOpts = {}): RGBA {
  const layout = getLayout(style, opts);
  const { codewords } = encodeText(text, style, ecc);
  const bits = padBits(bytesToBits(codewords), layout.bitCount);
  const prims = buildPrims(style, bits, opts);
  return rasterize(layout, prims, { scale, quiet: 30 });
}

describe("generate -> rasterize -> scan pipeline", () => {
  it.each(ALL_STYLES)("decodes a clean %s code", (style) => {
    const img = render(style, "سڵاو کوردستان ❤️");
    const res = decodeImage(img);
    expect(res).not.toBeNull();
    expect(res!.text).toBe("سڵاو کوردستان ❤️");
    expect(res!.style).toBe(style);
  });

  it("decodes ASCII at high ECC", () => {
    const img = render("circle", "Hello World", "high");
    expect(decodeImage(img)?.text).toBe("Hello World");
  });

  it("survives rotation", () => {
    const base = embed(render("wave", "HELLO WORLD 123"), 160);
    const rotated = transform(base, Math.PI / 18); // 10 degrees
    expect(decodeImage(rotated)?.text).toBe("HELLO WORLD 123");
  });

  it("survives rotation on a ring code", () => {
    const base = embed(render("circle", "ROTATED", "medium", 0.9), 120);
    const rotated = transform(base, -Math.PI / 5); // -36 degrees
    expect(decodeImage(rotated)?.text).toBe("ROTATED");
  });

  it("survives moderate blur", () => {
    const img = boxBlur(render("spiral", "BLUR TEST", "medium", 0.9), 1);
    expect(decodeImage(img)?.text).toBe("BLUR TEST");
  });

  it("survives sensor noise", () => {
    const img = noise(render("wave", "NOISY", "high"), 30);
    expect(decodeImage(img)?.text).toBe("NOISY");
  });

  it("survives reduced contrast", () => {
    const img = reduceContrast(render("leaf", "DIM LIGHT", "high"), 0.55);
    expect(decodeImage(img)?.text).toBe("DIM LIGHT");
  });

  it("survives a small occlusion", () => {
    const img = occlude(render("wave", "PARTLY COVERED", "high"), 300, 300, 90, 200);
    expect(decodeImage(img)?.text).toBe("PARTLY COVERED");
  });

  it("returns null on a blank image", () => {
    const blank: RGBA = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(255) };
    expect(decodeImage(blank)).toBeNull();
  });
});

describe("render variants still decode", () => {
  it.each([1, 2, 3, 5, 8, 13])("wave with %s rows", (rows) => {
    const text = rows === 1 ? "Hi" : rows === 2 ? "سلاو" : "KURDISTAN 2026";
    const img = render("wave", text, "low", 0.55, { waveRows: rows });
    expect(decodeImage(img)?.text).toBe(text);
  });

  it.each(["sine", "triangle", "pulse", "swell", "beads", "ribbon"] as const)("wave pattern %s", (pattern) => {
    const img = render("wave", "PATTERN", "medium", 0.55, { waveRows: 4, pattern });
    expect(decodeImage(img)?.text).toBe("PATTERN");
  });

  it.each(["sine", "swell", "beads", "ribbon"] as const)("wavecircle pattern %s", (pattern) => {
    const img = render("wavecircle", "RING WAVE", "medium", 0.7, { pattern });
    expect(decodeImage(img)?.text).toBe("RING WAVE");
  });

  it.each(["sine", "swell", "beads", "ribbon"] as const)("wavespiral pattern %s", (pattern) => {
    const img = render("wavespiral", "SPIRAL WAVE", "medium", 0.7, { pattern });
    expect(decodeImage(img)?.text).toBe("SPIRAL WAVE");
  });

  it.each([4, 6, 9, 11])("wavecircle with %s rings", (rings) => {
    const img = render("wavecircle", "RING SIZE", "medium", 0.7, { rings });
    expect(decodeImage(img)?.text).toBe("RING SIZE");
  });

  it.each([3, 5, 9, 10])("wavespiral with %s turns", (turns) => {
    const img = render("wavespiral", "TURN COUNT", "medium", 0.7, { turns });
    expect(decodeImage(img)?.text).toBe("TURN COUNT");
  });

  it.each([4, 7, 11])("circle with %s rings", (rings) => {
    const img = render("circle", "DOT RINGS", "medium", 0.7, { rings });
    expect(decodeImage(img)?.text).toBe("DOT RINGS");
  });

  it.each([3, 6, 10])("spiral with %s turns", (turns) => {
    const img = render("spiral", "DOT SPIRAL", "medium", 0.7, { turns });
    expect(decodeImage(img)?.text).toBe("DOT SPIRAL");
  });

  it("wave with thick strokes", () => {
    const img = render("wave", "THICK", "medium", 0.55, { waveRows: 3, thickness: 18 });
    expect(decodeImage(img)?.text).toBe("THICK");
  });

  it("wave with thin strokes", () => {
    const img = render("wave", "THIN", "high", 0.55, { waveRows: 6, thickness: 4 });
    expect(decodeImage(img)?.text).toBe("THIN");
  });

  it.each(["slender", "apple", "chenar"] as const)("leaf variant %s", (leafVariant) => {
    const img = render("leaf", "TREE", "medium", 0.55, { leafVariant });
    expect(decodeImage(img)?.text).toBe("TREE");
  });
});
