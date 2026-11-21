import type { Layout, Prim } from "./layout/types";

const TONE_COLORS = { dark: "#101318", light: "#ffffff", gray: "#c9d2dd" } as const;

/**
 * Draw a primitive list onto a 2D canvas. The same primitive list is what
 * the test rasterizer uses, so what you see is exactly what gets scanned.
 */
export function drawPrims(
  ctx: CanvasRenderingContext2D,
  prims: Prim[],
  scale = 1,
  ink = "#101318"
): void {
  for (const p of prims) {
    const color = p.tone === "gray" ? TONE_COLORS.gray : p.tone === "light" ? TONE_COLORS.light : ink;
    if (p.t === "disc") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, p.r * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.t === "ring") {
      ctx.strokeStyle = color;
      ctx.lineWidth = p.w * scale;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, p.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.t === "fill") {
      ctx.fillStyle = color;
      ctx.beginPath();
      p.pts.forEach((v, i) => {
        if (i === 0) ctx.moveTo(v.x * scale, v.y * scale);
        else ctx.lineTo(v.x * scale, v.y * scale);
      });
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = p.w * scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      p.pts.forEach((v, i) => {
        if (i === 0) ctx.moveTo(v.x * scale, v.y * scale);
        else ctx.lineTo(v.x * scale, v.y * scale);
      });
      ctx.stroke();
    }
  }
}

/** Render a full code to a canvas sized to the layout (with quiet-zone margin). */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  layout: Layout,
  prims: Prim[],
  quiet = 24,
  ink?: string
): void {
  const w = layout.width + quiet * 2;
  const h = layout.height + quiet * 2;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(quiet, quiet);
  drawPrims(ctx, prims, 1, ink);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
