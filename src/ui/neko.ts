import { CAT_W, type Cat } from './neko-logic.ts';
import { CAT_H, CAT_PALETTE, catFrame } from './neko-sprites.ts';
import { px, smallText, sprite, type Ctx } from './pixel.ts';

/** Native height of a tile's floor: the cat plus a ground line. */
export const FLOOR_H = CAT_H + 2;
/** CSS pixels per native pixel. */
export const FLOOR_SCALE = 3;

export interface Ink {
  ink: string;
  paper: string;
}

function bubble(ctx: Ctx, x: number, text: string, c: Ink): void {
  px(ctx, x, 0, 7, 9, c.ink);
  px(ctx, x + 1, 1, 5, 7, c.paper);
  smallText(ctx, text, x + 2, 2, c.ink);
}

/** Colors come from the page's CSS (--ink/--bg), so the theme lives in one place. */
export function drawFloor(ctx: Ctx, width: number, cat: Cat, c: Ink, frame: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, FLOOR_H);
  px(ctx, 0, FLOOR_H - 1, width, 1, c.ink);

  const y = FLOOR_H - 1 - CAT_H;
  sprite(ctx, catFrame(cat.mode, cat.dir, frame), CAT_PALETTE, cat.x, y);

  // Extras go beside the head, on whichever side has room. (oneko's sleep frames draw their own Zs.)
  const side = cat.x + CAT_W + 8 <= width ? cat.x + CAT_W + 1 : cat.x - 8;
  switch (cat.mode) {
    case 'alert':
    case 'scratch':
      bubble(ctx, side, '!', c);
      break;
    case 'wash':
      // Blinking sparkle: "done", told apart from a plain sitting cat.
      if (frame % 2 === 0) {
        px(ctx, side + 2, 3, 1, 5, c.ink);
        px(ctx, side, 5, 5, 1, c.ink);
      }
      break;
    case 'run':
      // Dust behind the back paw.
      px(ctx, cat.dir === 1 ? cat.x - 2 : cat.x + CAT_W + 1, FLOOR_H - 3 - (frame % 2), 1, 1, c.ink);
      break;
  }
}
