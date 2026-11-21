export default function About() {
  return (
    <section className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-[var(--muted)]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">What is this?</h2>
        <p>
          GlyphCode is an <strong className="text-[var(--text)]">experimental visual data encoding system</strong>.
          It is not a QR code. Instead of square modules in a grid, it encodes text into non-square
          visual languages — wavebands, dot rings, dotted spirals, wavy rings, wavy spirals and
          leaf silhouettes — and can read them back with a phone camera, entirely offline.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">The pipeline</h2>
        <pre className="font-mono-code overflow-x-auto rounded-xl bg-[var(--panel-2)] p-4 text-xs leading-6 text-[var(--text)]">
{`TEXT (UTF-8)
  ↓
HEADER + PAYLOAD + CRC-32
  ↓
REED–SOLOMON ERROR CORRECTION (per block)
  ↓
STYLE RENDERER (6 styles, many variants)
  ↓
VISUAL CODE  ────── camera ──────
  ↓
GRAYSCALE → OTSU BINARIZE
  ↓
FIND BULLSEYE SYNC MARKERS (×2)
  ↓
SIMILARITY TRANSFORM (position/rotation/scale)
  ↓
SAMPLE DATA MODULES
  ↓
RS DECODE → CRC VERIFY → UTF-8
  ↓
ORIGINAL TEXT`}
        </pre>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">The binary format</h2>
        <pre className="font-mono-code overflow-x-auto rounded-xl bg-[var(--panel-2)] p-4 text-xs leading-6 text-[var(--text)]">
{`[MAGIC   1B  0xE7]   not RS-protected
[VERSION 1B  0x01]
[META    1B  style|ecc|lenHi]
[LEN_LO  1B]
[PAYLOAD nB  UTF-8]   ┐
[CRC32   4B]          ├ RS blocks of ≤150B + parity
[RS PARITY …]         ┘`}
        </pre>
        <p className="mt-3">
          Every style carries two bullseye finder markers. They give the scanner the code&apos;s
          position, orientation and scale; the data modules are then sampled at fixed canonical
          coordinates shared by the renderer and the decoder. Render options — wave rows and
          patterns, ring counts, spiral turns, stroke thickness, leaf silhouette — only change
          how the modules are drawn, so the scanner simply tries each variant until the
          MAGIC + CRC check succeeds. There is no hidden QR code, no ID lookup, and no server —
          the text is in the drawing.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Honest limitations</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>This is a prototype. It is not more reliable than a QR code.</li>
          <li>Works best front-on; strong perspective skew is not yet corrected.</li>
          <li>Capacity is small by design — tens to a few hundred bytes depending on style and ECC.</li>
          <li>The code needs to fill a reasonable part of the camera frame.</li>
        </ul>
      </div>
    </section>
  );
}
