/** Minimal canvas surface: lets the rasterizer be tested without a DOM. */
export interface PixelSink {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export type Point = readonly [number, number];

/**
 * World units → screen pixels, 2:1 isometric. Integer in, integer out, so edges stay crisp.
 * One tile is 4×4 units = 16×8 px.
 */
export function project(x: number, y: number, z: number): [number, number] {
  return [(x - y) * 2, x + y - z];
}

/**
 * Scanline fill sampling pixel centres. Canvas paths antialias their edges, which turns into
 * mush once the canvas is upscaled with image-rendering: pixelated; integer rects do not.
 */
export function fillPoly(ctx: PixelSink, pts: readonly Point[], color: string): void {
  if (pts.length < 3) return;
  ctx.fillStyle = color;
  const ys = pts.map((p) => p[1]);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  for (let y = top; y < bottom; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= yc && yc < by) || (by <= yc && yc < ay)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const start = Math.ceil(xs[i]! - 0.5);
      const end = Math.ceil(xs[i + 1]! - 0.5);
      if (end > start) ctx.fillRect(start, y, end - start, 1);
    }
  }
}
