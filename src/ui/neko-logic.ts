import type { SessionStatus } from '../types.ts';

/** Native pixels. */
export const CAT_W = 32;
export const SPEED = 2;

export type CatMode = 'sleep' | 'run' | 'sit' | 'wash' | 'alert' | 'scratch';

export interface Cat {
  x: number;
  dir: 1 | -1;
  mode: CatMode;
}

export interface CatInput {
  status: SessionStatus;
  hostOnline: boolean;
  /** Width of the floor the cat is confined to. */
  width: number;
  /** Pointer x on this floor, or null when nobody is pointing. */
  target: number | null;
}

/** FNV-1a, 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (x: number, max: number) => Math.min(Math.max(x, 0), Math.max(max, 0));

export function initialCat(sessionId: string, width: number): Cat {
  const h = hash(sessionId);
  return { x: h % Math.max(1, width - CAT_W + 1), dir: h & 1 ? 1 : -1, mode: 'sit' };
}

export function stepCat(cat: Cat, i: CatInput): Cat {
  const max = i.width - CAT_W;
  const x = clamp(cat.x, max);

  if (!i.hostOnline) return { ...cat, x, mode: 'sleep' };
  // The alarm must stay where you left it: no chasing for cats that need you.
  if (i.status === 'waiting') return { ...cat, x, mode: 'alert' };
  if (i.status === 'error') return { ...cat, x, mode: 'scratch' };

  if (i.target !== null) {
    const goal = clamp(Math.round(i.target - CAT_W / 2), max);
    if (Math.abs(goal - x) <= SPEED) return { ...cat, x: goal, mode: 'sit' };
    const dir = goal > x ? 1 : -1;
    return { x: x + dir * SPEED, dir, mode: 'run' };
  }

  switch (i.status) {
    case 'working': {
      let dir = cat.dir;
      let nx = x + dir * SPEED;
      if (nx > max || nx < 0) {
        dir = dir === 1 ? -1 : 1;
        nx = clamp(x + dir * SPEED, max);
      }
      return { x: nx, dir, mode: 'run' };
    }
    case 'done':
      return { ...cat, x, mode: 'wash' };
    case 'idle':
    case 'ended':
      return { ...cat, x, mode: 'sleep' };
  }
}
