"use client";

import { useEffect, useRef, useState } from "react";
import { decodeImage, type ScanSuccess } from "@/lib/scan/pipeline";

type Phase = "idle" | "requesting" | "scanning" | "success" | "error";

export default function ScannerView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanSuccess | null>(null);
  const [copied, setCopied] = useState(false);
  const frameNo = useRef(0);

  useEffect(() => stop, []);

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setResult(null);
    setCopied(false);
    setMessage(null);
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setPhase("scanning");
      timerRef.current = window.setInterval(scanFrame, 180);
    } catch (e) {
      setPhase("error");
      setMessage(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access and try again."
          : "Could not open the camera on this device."
      );
    }
  }

  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Fast pass every frame at reduced resolution; a slower full-resolution
    // pass every 4th frame catches codes that are small in frame.
    const res = decodeImage(img) || (frameNo.current % 4 === 0 ? decodeImage(img, 1500) : null);
    frameNo.current++;
    if (res) {
      setResult(res);
      setPhase("success");
      stop();
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {phase === "scanning" && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[62%] w-[72%] rounded-2xl border-2 border-[var(--accent)]/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <div className="absolute bottom-3 left-0 right-0 text-center text-sm text-white/90">Scanning…</div>
          </>
        )}
        {phase !== "scanning" && phase !== "success" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
            <div className="text-4xl">▣</div>
            <p className="text-sm">
              {phase === "requesting" ? "Requesting camera…" : "Camera is off"}
            </p>
          </div>
        )}
      </div>

      {phase === "success" && result ? (
        <div className="w-full rounded-2xl border border-[var(--accent)]/50 bg-[var(--panel)] p-5">
          <div className="mb-1 flex items-center gap-2 text-[var(--accent)]">
            <span>✓</span>
            <span className="font-semibold">Code detected</span>
          </div>
          <div className="mb-3 text-sm text-[var(--muted)]">
            Style: {result.style} · ECC: {result.ecc} · {result.payloadLen} bytes
          </div>
          <div dir="auto" className="font-mono-code mb-4 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-lg">
            {result.text}
          </div>
          <div className="flex gap-3">
            <button onClick={copy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={start} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--panel-2)]">
              Scan Again
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={start}
            disabled={phase === "requesting" || phase === "scanning"}
            className="rounded-xl bg-[var(--accent)] px-8 py-3 font-semibold text-black disabled:opacity-40"
          >
            {phase === "scanning" ? "Scanning…" : "Start Camera"}
          </button>
          {message && <p className="text-sm text-red-400">{message}</p>}
          <div className="max-w-md text-center text-xs leading-relaxed text-[var(--muted)]">
            Point the camera at a GlyphCode. If decoding fails: move closer, improve lighting, hold the
            camera steady, and make sure the whole code is inside the frame. Everything is processed
            locally — no image ever leaves this device.
          </div>
        </div>
      )}
    </section>
  );
}
