import type { BarState, Face } from './doom-logic.ts';
import { BIG, FACE_H, FACE_W, PALETTE, SMALL, composeFace } from './sprites.ts';

export const BAR_W = 320;
export const BAR_H = 32;

const C = {
  stone: '#5f5f5f',
  stoneDark: '#3c3c3c',
  stoneLight: '#8a8a8a',
  grainDark: '#565656',
  grainLight: '#686868',
  shadow: '#262626',
  well: '#2b2b2b',
  label: '#c8c8c8',
  red: '#d41414',
  redShade: '#6a0a0a',
  yellow: '#f0cc3c',
  dim: '#7a7a7a',
  empty: '#454545',
  keys: { blue: '#3a5cf0', yellow: '#e8c020', red: '#d82020' },
} as const;

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Deterministic grain so the stone texture does not shimmer between frames. */
function stone(ctx: Ctx): void {
  px(ctx, 0, 0, BAR_W, BAR_H, C.stone);
  for (let y = 0; y < BAR_H; y++) {
    for (let x = 0; x < BAR_W; x++) {
      const n = (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0) % 9;
      if (n === 0) px(ctx, x, y, 1, 1, C.grainDark);
      else if (n === 1) px(ctx, x, y, 1, 1, C.grainLight);
    }
  }
}

/** Recessed panel: dark top/left edge, light bottom/right edge. */
function panel(ctx: Ctx, x: number, w: number): void {
  px(ctx, x, 0, w, 1, C.stoneDark);
  px(ctx, x, 0, 1, BAR_H, C.stoneDark);
  px(ctx, x, BAR_H - 1, w, 1, C.stoneLight);
  px(ctx, x + w - 1, 0, 1, BAR_H, C.stoneLight);
}

function glyphs(ctx: Ctx, font: Record<string, string[]>, text: string, x: number, y: number, scale: number, color: string, shade?: string): void {
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

const smallWidth = (text: string) => text.length * 4 - 1;
const bigWidth = (text: string) => text.length * 12 - 2;

function small(ctx: Ctx, text: string, x: number, y: number, color: string): void {
  glyphs(ctx, SMALL, text, x, y, 1, color, C.shadow);
}

function smallCentered(ctx: Ctx, text: string, x: number, w: number, y: number, color: string): void {
  small(ctx, text, x + Math.floor((w - smallWidth(text)) / 2), y, color);
}

function big(ctx: Ctx, text: string, x: number, w: number): void {
  glyphs(ctx, BIG, text, x + Math.floor((w - bigWidth(text)) / 2), 4, 2, C.red, C.redShade);
}

export function drawFace(ctx: Ctx, face: Face, frame: number, x: number, y: number): void {
  composeFace(face.expression, face.tier, frame).forEach((row, fy) => {
    [...row].forEach((ch, fx) => {
      const color = PALETTE[ch];
      if (color && color !== 'transparent') px(ctx, x + fx, y + fy, 1, 1, color);
    });
  });
}

function key(ctx: Ctx, x: number, y: number, color: string, lit: boolean): void {
  if (!lit) {
    px(ctx, x, y, 8, 6, C.well);
    return;
  }
  px(ctx, x, y, 8, 6, color);
  px(ctx, x, y, 8, 1, '#ffffff55');
  px(ctx, x + 2, y + 2, 4, 2, '#00000066');
}

const pct = (v: number | null) => (v === null ? '--%' : `${v}%`);

/** Draws the whole bar at native 320×32; CSS scales it with image-rendering: pixelated. */
export function drawBar(ctx: Ctx, s: BarState, frame: number): void {
  ctx.imageSmoothingEnabled = false;
  stone(ctx);

  // AMMO
  panel(ctx, 0, 48);
  big(ctx, String(Math.min(s.ammo, 999)), 0, 48);
  smallCentered(ctx, 'AMMO', 0, 48, 25, C.label);

  // HEALTH = 5h window left
  panel(ctx, 48, 56);
  big(ctx, pct(s.health), 48, 56);
  smallCentered(ctx, 'HEALTH', 48, 56, 25, C.label);

  // ARMS = host slots
  panel(ctx, 104, 38);
  s.arms.forEach((a, i) => {
    const color = a.online ? C.yellow : a.host ? C.dim : C.empty;
    small(ctx, String(a.slot), 111 + (i % 3) * 9, 5 + Math.floor(i / 3) * 8, color);
  });
  smallCentered(ctx, 'ARMS', 104, 38, 25, C.label);

  // FACE
  panel(ctx, 142, 36);
  px(ctx, 143, 1, 34, BAR_H - 2, C.well);
  drawFace(ctx, s.face, frame, 142 + Math.floor((36 - FACE_W) / 2), BAR_H - FACE_H - 3);

  // ARMOR = weekly window left
  panel(ctx, 178, 56);
  big(ctx, pct(s.armor), 178, 56);
  smallCentered(ctx, 'ARMOR', 178, 56, 25, C.label);

  // KEYS: blue = working, yellow = new result, red = needs you
  panel(ctx, 234, 14);
  key(ctx, 237, 3, C.keys.blue, s.keys.blue);
  key(ctx, 237, 13, C.keys.yellow, s.keys.yellow);
  key(ctx, 237, 23, C.keys.red, s.keys.red);

  // Tally, like the ammo table
  panel(ctx, 248, 72);
  const rows: [string, number][] = [
    ['ESPERA', s.tally.waiting],
    ['LISTO', s.tally.done],
    ['CURRO', s.tally.working],
    ['ZZZ', s.tally.idle],
  ];
  rows.forEach(([label, n], i) => {
    const y = 3 + i * 7;
    small(ctx, label, 252, y, C.label);
    const v = String(n);
    small(ctx, v, 316 - smallWidth(v), y, n > 0 ? C.yellow : C.dim);
  });
}

/** A single face on its own canvas (session tiles). */
export function drawFaceTile(ctx: Ctx, face: Face, frame: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  drawFace(ctx, face, frame, 0, 0);
}
