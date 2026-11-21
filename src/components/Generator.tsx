"use client";

import { useEffect, useRef, useState } from "react";
import { encodeText, maxPayloadFor } from "@/lib/codec/encode";
import { bytesToBits, padBits } from "@/lib/codec/bits";
import {
  ALL_STYLES,
  buildPrims,
  getLayout,
  LEAF_VARIANTS,
  RING_DEFAULT,
  RING_MAX,
  RING_MIN,
  TURN_DEFAULT,
  TURN_MAX,
  TURN_MIN,
  WAVE_MAX_ROWS,
  type LeafVariant,
  type RenderOpts,
  type WavePattern,
} from "@/lib/layout";
import { renderToCanvas } from "@/lib/raster";
import { decodeImage } from "@/lib/scan/pipeline";
import type { EccLevel, StyleId } from "@/lib/codec/format";
import type { Layout } from "@/lib/layout/types";
import type { Prim } from "@/lib/layout/types";

const STYLE_META: Record<StyleId, { label: string; hint: string; icon: string }> = {
  wave: { label: "Wave", hint: "waveband rows, highest capacity", icon: "〜" },
  circle: { label: "Circle", hint: "concentric rings of dots", icon: "◉" },
  spiral: { label: "Spiral", hint: "dots on an archimedean spiral", icon: "🌀" },
  leaf: { label: "Leaf", hint: "dot field in a leaf silhouette", icon: "🍃" },
  wavecircle: { label: "Wave Circle", hint: "wavy concentric rings", icon: "◎" },
  wavespiral: { label: "Wave Spiral", hint: "a wavy spiral arm", icon: "🌀" },
};

const PATTERNS: { id: WavePattern; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "sine", label: "Sine" },
  { id: "triangle", label: "Triangle" },
  { id: "pulse", label: "Pulse" },
  { id: "swell", label: "Swell" },
  { id: "beads", label: "Beads" },
  { id: "ribbon", label: "Ribbon" },
];

const LEAVES: { id: LeafVariant; label: string }[] = [
  { id: "slender", label: "Willow" },
  { id: "apple", label: "Apple" },
  { id: "chenar", label: "Plane (چنار)" },
];

const ECC_META: Record<EccLevel, { label: string; hint: string }> = {
  low: { label: "Low", hint: "smallest code, fixes ~5% damage" },
  medium: { label: "Medium", hint: "balanced" },
  high: { label: "High", hint: "survives heavy damage" },
  max: { label: "Maximum", hint: "very resilient, low capacity" },
};

const SAMPLES = ["سڵاو کوردستان", "Hello World", "ئەمە تاقیکردنەوەی سیستەمەکەیە."];

export default function Generator() {
  const [text, setText] = useState("سڵاو کوردستان");
  const [style, setStyle] = useState<StyleId>("wave");
  const [ecc, setEcc] = useState<EccLevel>("medium");
  const [waveRows, setWaveRows] = useState(4);
  const [thickness, setThickness] = useState(9);
  const [pattern, setPattern] = useState<WavePattern>("smooth");
  const [leafVariant, setLeafVariant] = useState<LeafVariant>("slender");
  const [rings, setRings] = useState(RING_DEFAULT);
  const [turns, setTurns] = useState(TURN_DEFAULT);
  const [rendered, setRendered] = useState<{ layout: Layout; prims: Prim[]; bits: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; detail: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const opts: RenderOpts = { waveRows, thickness, pattern, leafVariant, rings, turns };
  const payloadBytes = new TextEncoder().encode(text).length;
  const layout = getLayout(style, opts);
  const capacity = maxPayloadFor(layout.bitCount, ecc);
  const fits = payloadBytes > 0 && payloadBytes <= capacity;

  useEffect(() => {
    if (rendered && canvasRef.current) {
      renderToCanvas(canvasRef.current, rendered.layout, rendered.prims);
    }
  }, [rendered]);

  function invalidate() {
    setRendered(null);
    setVerify(null);
  }

  function generate() {
    setVerify(null);
    setError(null);
    try {
      const lay = getLayout(style, opts);
      const { codewords } = encodeText(text, style, ecc);
      const bits = padBits(bytesToBits(codewords), lay.bitCount);
      if (bits.length > lay.bitCount) {
        setError("Text is too large for this visual format.");
        return;
      }
      setRendered({ layout: lay, prims: buildPrims(style, bits, opts), bits: bits.length });
    } catch (e) {
      setRendered(null);
      setError(e instanceof Error ? e.message : "Encode failed");
    }
  }

  function download() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = `glyphcode-${style}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }

  function print() {
    const c = canvasRef.current;
    if (!c) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0">
        <img src="${c.toDataURL("image/png")}" style="max-width:95vw"/>
      </body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  /** Self-test: decode straight back out of the rendered canvas pixels. */
  function verifyNow() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const res = decodeImage(img);
    if (!res) setVerify({ ok: false, detail: "Could not decode the rendered code." });
    else if (res.text !== text) setVerify({ ok: false, detail: `Decoded different text: "${res.text}"` });
    else setVerify({ ok: true, detail: `Self-check passed — ${res.style} code decoded byte-for-byte.` });
  }

  const isWaveFamily = style === "wave" || style === "wavecircle" || style === "wavespiral";
  const showThickness = isWaveFamily;
  const showRings = style === "circle" || style === "wavecircle";
  const showTurns = style === "spiral" || style === "wavespiral";

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="flex flex-col gap-5">
        <div>
          <label className="mb-2 block text-sm font-medium">Enter your text</label>
          <textarea
            dir="auto"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              invalidate();
            }}
            rows={3}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-lg outline-none focus:border-[var(--accent)]"
            placeholder="Type anything — English, کوردی, العربية, 123, symbols…"
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
            <span>
              Characters: {text.length} · UTF-8 bytes: {payloadBytes}
            </span>
            <span className={fits ? "text-[var(--accent)]" : "text-red-400"}>
              capacity: {payloadBytes}/{capacity} B {fits ? "· OK" : "· TOO BIG"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setText(s);
                  invalidate();
                }}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
              >
                {s.length > 22 ? s.slice(0, 22) + "…" : s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Choose a visual style</label>
          <div className="grid grid-cols-3 gap-2">
            {ALL_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStyle(s);
                  invalidate();
                }}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  style === s
                    ? "border-[var(--accent)] bg-[var(--panel-2)]"
                    : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--muted)]"
                }`}
              >
                <div className="text-lg">{STYLE_META[s].icon}</div>
                <div className="text-sm font-semibold">{STYLE_META[s].label}</div>
                <div className="text-xs text-[var(--muted)]">{STYLE_META[s].hint}</div>
              </button>
            ))}
          </div>
        </div>

        {style === "wave" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Rows</span>
              <span className="text-[var(--muted)]">{waveRows} row{waveRows > 1 ? "s" : ""}</span>
            </div>
            <input
              type="range"
              min={1}
              max={WAVE_MAX_ROWS}
              value={waveRows}
              onChange={(e) => {
                setWaveRows(Number(e.target.value));
                invalidate();
              }}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        )}

        {showRings && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Circle size</span>
              <span className="text-[var(--muted)]">{rings} rings</span>
            </div>
            <input
              type="range"
              min={RING_MIN}
              max={RING_MAX}
              value={rings}
              onChange={(e) => {
                setRings(Number(e.target.value));
                invalidate();
              }}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        )}

        {showTurns && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Spiral turns</span>
              <span className="text-[var(--muted)]">{turns} turns</span>
            </div>
            <input
              type="range"
              min={TURN_MIN}
              max={TURN_MAX}
              value={turns}
              onChange={(e) => {
                setTurns(Number(e.target.value));
                invalidate();
              }}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        )}

        {isWaveFamily && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 text-sm font-medium">Wave pattern</div>
            <div className="grid grid-cols-4 gap-2">
              {PATTERNS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPattern(p.id);
                    invalidate();
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    pattern === p.id
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {style === "leaf" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 text-sm font-medium">Leaf shape</div>
            <div className="grid grid-cols-3 gap-2">
              {LEAVES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLeafVariant(l.id);
                    invalidate();
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    leafVariant === l.id
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showThickness && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Line thickness</span>
              <span className="text-[var(--muted)]">{thickness}px</span>
            </div>
            <input
              type="range"
              min={3}
              max={20}
              value={thickness}
              onChange={(e) => {
                setThickness(Number(e.target.value));
                invalidate();
              }}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Error correction</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ECC_META) as EccLevel[]).map((e) => (
              <button
                key={e}
                onClick={() => {
                  setEcc(e);
                  invalidate();
                }}
                title={ECC_META[e].hint}
                className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                  ecc === e
                    ? "border-[var(--accent)] bg-[var(--panel-2)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {ECC_META[e].label}
              </button>
            ))}
          </div>
        </div>

        {!fits && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            Text is too large for this visual format.
            <ul className="mt-1 list-inside list-disc text-xs">
              <li>Shorter text</li>
              <li>Lower error correction</li>
              <li>{style === "wave" ? "More rows, or a" : "A"} higher-capacity style</li>
            </ul>
          </div>
        )}
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <button
          onClick={generate}
          disabled={!fits}
          className="rounded-xl bg-[var(--accent)] px-6 py-3 text-base font-semibold text-black transition-opacity disabled:opacity-40"
        >
          Generate
        </button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-4">
          {rendered ? (
            <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[70vh] w-full max-w-[900px] object-contain" />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-neutral-400">
              Your visual code will appear here
            </div>
          )}
        </div>
        {rendered && (
          <>
            <div className="text-xs text-[var(--muted)]">
              {STYLE_META[style].label} · {rendered.bits} modules · ECC {ecc}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={download} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--panel-2)]">
                Download PNG
              </button>
              <button onClick={print} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--panel-2)]">
                Print
              </button>
              <button
                onClick={verifyNow}
                className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--panel-2)]"
              >
                Verify scan
              </button>
            </div>
            {verify && (
              <div
                className={`w-full rounded-xl border p-3 text-sm ${
                  verify.ok ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-red-500/40 bg-red-500/10 text-red-300"
                }`}
              >
                {verify.detail}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
