import type { SessionStatus } from '../types.ts';
import { CAT_W, type Cat } from './neko-logic.ts';
import { CAT_H, CAT_PALETTE, catFrame } from './neko-sprites.ts';
import { px, smallText, sprite, type Ctx } from './pixel.ts';

/** Native height of a tile's floor: the cat plus a ground line. */
export const FLOOR_H = CAT_H + 2;
/** CSS pixels per native pixel. */
export const FLOOR_SCALE = 3;

const GROUND: Record<SessionStatus, string> = {
  waiting: '#e02424',
  error: '#ff5a1f',
  done: '#f0cc3c',
  working: '#4f7cff',
  idle: '#5c5650',
  ended: '#5c5650',
};

function bubble(ctx: Ctx, x: number, text: string, color: string): void {
  px(ctx, x, 0, 7, 9, color);
  px(ctx, x + 1, 1, 5, 7, '#ffffff');
  smallText(ctx, text, x + 2, 2, color);
}

export function drawFloor(ctx: Ctx, width: number, cat: Cat, status: SessionStatus, frame: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, FLOOR_H);
  px(ctx, 0, FLOOR_H - 1, width, 1, GROUND[status]);

  const y = FLOOR_H - 1 - CAT_H;
  sprite(ctx, catFrame(cat.mode, cat.dir, frame), CAT_PALETTE, cat.x, y);

  // Extras go beside the head, on whichever side has room.
  const side = cat.x + CAT_W + 8 <= width ? cat.x + CAT_W + 1 : cat.x - 8;
  switch (cat.mode) {
    case 'alert':
      bubble(ctx, side, '!', '#e02424');
      break;
    case 'scratch':
      bubble(ctx, side, '!', '#ff5a1f');
      break;
    case 'sleep': {
      const rise = frame % 3;
      smallText(ctx, 'Z', side + rise, 8 - rise * 3, '#a8ccff');
      break;
    }
    case 'wash':
      // Blinking sparkle: "done", told apart from a plain sitting cat.
      if (frame % 2 === 0) {
        px(ctx, side + 2, 3, 1, 5, '#f0cc3c');
        px(ctx, side, 5, 5, 1, '#f0cc3c');
      }
      break;
    case 'run':
      // Dust behind the back paw.
      px(ctx, cat.dir === 1 ? cat.x - 2 : cat.x + CAT_W + 1, FLOOR_H - 3 - (frame % 2), 1, 1, '#8c847a');
      break;
  }
}
