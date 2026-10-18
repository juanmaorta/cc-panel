// Original pixel art in the spirit of Neko (the desktop cat). Not the original sprites.
// Generated from a frame sheet; keep every row CAT_W wide (enforced by tests).
import type { CatMode } from './neko-logic.ts';

export const CAT_H = 16;

export const CAT_PALETTE: Record<string, string> = {
  '.': 'transparent',
  k: '#1a1410', // outline
  w: '#f6f3ec', // fur
  g: '#cfc8ba', // fur shade
  p: '#f2a0aa', // ears, nose
  e: '#1a1410', // eyes
  r: '#ff3a1a', // angry eyes
};

/** All frames face right; catFrame mirrors them for dir = -1. */
export const CAT_FRAMES: Record<CatMode, string[][]> = {
  sleep: [
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '...k...k........',
      '..kpk.kpkkkkk...',
      '..kwwkwwwwwwwkk.',
      '.kwwwwwwwwwwwwwk',
      '.kwkkwwkkwwgwwwk',
      '.kwwwwppwwwgwwwk',
      '..kwwwwwwwwwwwk.',
      '...kkkkkkkkkkk..',
    ],
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '...k...k........',
      '..kpk.kpkkkkkk..',
      '..kwwkwwwwwwwwk.',
      '.kwwwwwwwwwwwwwk',
      '.kwkkwwkkwwgwwwk',
      '.kwwwwppwwwgwwwk',
      '..kwwwwwwwwwwwk.',
      '...kkkkkkkkkkk..',
    ],
  ],
  run: [
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '...........k.k..',
      '..........kpkpk.',
      '..........kwwwwk',
      'k.........kwewwk',
      '.k..kkkkkkwwwwpk',
      '..kkwwwwwwwwwkk.',
      '...kwwwwwwwwwk..',
      '..kwkkkkkkkkwk..',
      '.kwk........kwk.',
      '.kk..........kk.',
    ],
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '...........k.k..',
      '..........kpkpk.',
      '..........kwwwwk',
      '..........kwewwk',
      'kk..kkkkkkwwwwpk',
      '..kkwwwwwwwwwkk.',
      '...kwwwwwwwwwk..',
      '...kkkkkkkkkk...',
      '....kwk..kwk....',
      '....kk....kk....',
    ],
  ],
  sit: [
    [
      '................',
      '...k........k...',
      '..kpk......kpk..',
      '..kwwkkkkkkwwk..',
      '..kwwwwwwwwwwk..',
      '..kwwewwwwewwk..',
      '..kwwwwppwwwwk..',
      '...kwwwkkwwwk...',
      '....kkwwwwkk....',
      '...kwwwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '..kwwwgwwgwwwkk.',
      '..kwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
  ],
  wash: [
    [
      '................',
      '...k........k...',
      '..kpk......kpk..',
      '..kwwkkkkkkwwk..',
      '..kwkwwwwwwkwk..',
      '..kwwwwwwwwwwk..',
      '..kwwwwppwwwwk..',
      '...kwwkwkkwwk...',
      '...kkwwwwwkk....',
      '..kwwkwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '..kwwwgwwgwwwkk.',
      '..kwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
    [
      '................',
      '...k........k...',
      '..kpk......kpk..',
      '..kwwkkkkkkwwk..',
      '..kwkwwwwwwkwk..',
      '..kwwwwwwwwwwk..',
      '..kwwwwppwwwwk..',
      '...kwkwkpkwwk...',
      '...kkwwkwwkk....',
      '..kwwkwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '..kwwwgwwgwwwkk.',
      '..kwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
  ],
  alert: [
    [
      '..k..........k..',
      '..kk........kk..',
      '..kpk......kpk..',
      '..kwwkkkkkkwwk..',
      '..kwwwwwwwwwwk..',
      '..kweewwwweewk..',
      '..kweewppweewk..',
      '...kwwwkkwwwk...',
      '....kkwwwwkk....',
      '...kwwwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '..kwwwgwwgwwwkk.',
      '..kwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
  ],
  hiss: [
    [
      '.k.k........k.k.',
      '..kk........kk..',
      '..kpk......kpk..',
      '.kkwwkkkkkkwwkk.',
      '..kwwwwwwwwwwk..',
      '..kwrrwwwwrrwk..',
      '..kwwwwppwwwwk..',
      '...kwwkppkwwk...',
      '.k..kkwwwwkk..k.',
      '..kkwwwwwwwwkk..',
      '.kwwwwwwwwwwwwk.',
      '..kwwwgwwgwwwkk.',
      '.kwwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
    [
      '..k..........k..',
      '..kk........kk..',
      '..kpk......kpk..',
      '.kkwwkkkkkkwwkk.',
      '..kwwwwwwwwwwk..',
      '..kwrrwwwwrrwk..',
      '..kwwwwppwwwwk..',
      '...kwwkppkwwk...',
      'k...kkwwwwkk...k',
      '..kkwwwwwwwwkk..',
      'kwwwwwwwwwwwwwwk',
      '..kwwwgwwgwwwkk.',
      '.kwwwwgwwgwwwkwk',
      '..kwwwkwwkwwwkwk',
      '...kkkkkkkkkkwk.',
      '............kk..',
    ],
  ],
};

export function mirror(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}

export function catFrame(mode: CatMode, dir: 1 | -1, frame: number): string[] {
  const frames = CAT_FRAMES[mode];
  const rows = frames[frame % frames.length]!;
  return dir === 1 ? rows : mirror(rows);
}
