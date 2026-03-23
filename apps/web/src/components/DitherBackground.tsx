import { useEffect, useRef } from "react";

const BAYER_8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const COLOR_DARK = { r: 0, g: 0, b: 0 };
const COLOR_LIGHT = { r: 180, g: 18, b: 18 };

const PIXEL = 5;

export function DitherBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cols = Math.ceil(w / PIXEL);
      const rows = Math.ceil(h / PIXEL);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = x / cols;
          const ny = y / rows;

          // Slow wavy animation
          const wave =
            Math.sin(nx * 2.5 + t * 0.12) * 0.18 +
            Math.sin(ny * 2.0 - t * 0.09) * 0.16 +
            Math.sin((nx + ny) * 1.8 + t * 0.07) * 0.12 +
            Math.sin((nx - ny) * 1.5 - t * 0.05) * 0.08;

          // Radial glow from bottom-center
          const dx = nx - 0.5;
          const dy = ny - 1.0;
          const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.4);

          // Secondary glow top-right
          const dx2 = nx - 0.85;
          const dy2 = ny - 0.2;
          const radial2 = Math.max(0, 1 - Math.sqrt(dx2 * dx2 + dy2 * dy2) * 2.2) * 0.4;

          const value = Math.min(1, Math.max(0, radial * 0.65 + radial2 + wave + 0.05));

          // Bayer ordered dithering
          const threshold = BAYER_8[y % 8][x % 8] / 64;
          const on = value > threshold;

          const c = on ? COLOR_LIGHT : COLOR_DARK;
          ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
          ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
      }

      t += 0.005;
      raf = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
