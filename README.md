# GlyphCode — an experimental visual data code

GlyphCode is an **experimental, fully offline** visual data encoding system inspired by QR codes
but built around non-square visual languages. The text is encoded directly into the drawing —
there is **no server, no database, no API, no ID lookup, and no hidden QR code**. If you print a
code or show it on a monitor, a camera scanner can recover the exact text locally.

## Prototype scope

This is a custom experimental format, not a standard QR code. Automated codec and synthetic render/scan tests do not establish reliable recovery from printed images or arbitrary cameras. Real-world scanning reliability remains experimental.

Case study: https://case-study.ibrahim-eng.dev/glyphcode

## Stack

- Next.js 15 (static export), React, TypeScript, Tailwind CSS 4
- Canvas API for rendering, `getUserMedia` for scanning
- No runtime dependencies beyond React — the codec, renderers and CV scanner are hand-rolled
- Vitest for the automated test suite

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # codec + end-to-end render→scan tests
npm run build      # static export to ./out (host it anywhere / offline)
```

## How it works

```
TEXT (UTF-8) → HEADER+CRC32 → Reed–Solomon blocks → style renderer → VISUAL CODE

camera frame → grayscale → Otsu binarize → find 2 bullseye sync markers →
similarity transform → sample data modules → RS decode → CRC verify → UTF-8 text
```

### Binary frame format

| Field     | Size     | Notes                                        |
|-----------|----------|----------------------------------------------|
| MAGIC     | 1 B      | `0xE7` — identifies a GlyphCode              |
| VERSION   | 1 B      | `0x01`                                       |
| META      | 1 B      | style:3b · ecc:2b · lenHi:3b                 |
| LEN_LO    | 1 B      | payload length low byte (max 2047 B)         |
| PAYLOAD   | n B      | UTF-8 bytes                                  |
| CRC32     | 4 B      | IEEE, over prefix+payload                    |
| RS parity | per block| blocks of ≤150 B + proportional parity     |

The 4-byte prefix is intentionally outside RS protection so the decoder knows the layout;
everything after it is covered by Reed–Solomon over GF(2⁸), correctable up to nsym/2 byte
errors per block.

### Visual styles

Each style has its own geometry — none of them is a reskinned QR grid:

- **Wave** — a configurable waveband (1–13 rows) between two big sync bullseyes; each cell
  pushes the wave up (1) or down (0). Row count, stroke thickness and the cell pattern
  (smooth / sine / triangle / pulse / swell / beads / ribbon) are all render options.
- **Circle** — concentric rings (4–11, adjustable) of presence/absence dots around a
  central bullseye, plus a satellite bullseye that fixes rotation.
- **Spiral** — dots at equal arc-length intervals on an Archimedean spiral (3–10 turns,
  adjustable); same finder pair.
- **Wave Circle** — concentric rings drawn as *wavy lines*: each ring bulges outward (1) or
  inward (0) per cell — Circle geometry with Wave encoding. Ring count, thickness and all
  wave patterns are adjustable.
- **Wave Spiral** — a continuous wavy Archimedean arm; radial bulges carry the bits —
  Spiral geometry with Wave encoding. Turn count, thickness and all wave patterns adjustable.
- **Leaf** — a dot field filling a leaf silhouette (vein + outline drawn, dots are the data);
  bullseyes at stem and tip. Silhouette variants: willow-like slender, apple, plane tree (چنار).

All styles share the same finder scheme: **two bullseyes** (dark ring / light gap / dark core)
give the scanner position, rotation and scale. Module coordinates are defined once in
`src/lib/layout/*` and used identically by the renderer and the scanner.

### Error correction levels

`low` ~15% of block data · `medium` ~32% · `high` ~60% · `max` ~95% (with small minimums so
short frames still get protection). Parity is proportional to each block's data size.
Higher ECC trades capacity for surviving blur, noise, occlusion and bad lighting.

## Project layout

```
src/lib/codec/     bits, crc32, GF(256) Reed–Solomon, frame format, encode/decode
src/lib/layout/    per-style canonical geometry + primitives (single source of truth)
src/lib/raster.ts  draws primitives to a canvas
src/lib/scan/      toGray/downscale/Otsu, connected-component bullseye finder,
                   similarity transform + module sampling, decode pipeline
src/components/    Generator, ScannerView, About, RegisterSW
tests/             codec round-trip + rasterized end-to-end decode tests
public/            PWA manifest, service worker, icon
```

## Offline / PWA

The build is a static export (`out/`), so it can be hosted anywhere or opened from a simple
static server. A service worker caches the app shell for offline use; generation and scanning
never touch the network.

## Honest limitations

- Prototype reliability, not QR-grade. Works best front-on; strong perspective skew is not
  corrected (only a similarity transform is fitted).
- Keep the code reasonably large in frame and the lighting decent.
- Capacity is small by design; the UI enforces per-style/per-ECC limits.
