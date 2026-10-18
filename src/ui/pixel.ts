import { SMALL } from './font.ts';

export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function glyphs(
  ctx: Ctx,
  font: Record<string, string[]>,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
  shade?: string,
): void {
  let cx = x;
  for (const ch of text) {
    const g = font[ch] ?? font[' '];
    if (g) {
      g.forEach((row, gy) => {
        [...row].forEach((bit, gx) => {
          if (bit !== '#') return;
          if (shade) px(ctx, cx + gx * scale + 1, y + gy * scale + 1, scale, scale, shade);
          px(ctx, cx + gx * scale, y + gy * scale, scale, scale, color);
        });
      });
    }
    cx += ((g?.[0]?.length ?? 3) + 1) * scale;
  }
}

/** Width in px of text in the 3×5 font. */
export const smallWidth = (text: string) => text.length * 4 - 1;

export function smallText(ctx: Ctx, text: string, x: number, y: number, color: string, shade?: string): void {
  glyphs(ctx, SMALL, text, x, y, 1, color, shade);
}

/** Draws a palette-indexed sprite; '.' and unknown keys are transparent. */
export function sprite(ctx: Ctx, rows: readonly string[], colors: Record<string, string>, x: number, y: number): void {
  rows.forEach((row, sy) => {
    [...row].forEach((ch, sx) => {
      const color = colors[ch];
      if (color && color !== 'transparent') px(ctx, x + sx, y + sy, 1, 1, color);
    });
  });
}
