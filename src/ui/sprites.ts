// Original pixel art in the spirit of the Doom status bar. No id Software assets.
import type { Expression, Tier } from './doom-logic.ts';

export const PALETTE: Record<string, string> = {
  '.': 'transparent',
  k: '#1e1108', // outline
  h: '#4a2c12', // hair
  H: '#6e4520', // hair highlight
  s: '#b4703f', // skin
  S: '#8a4f28', // skin shadow
  l: '#d99a66', // skin light
  e: '#3a220c', // brow
  w: '#f2efe8', // eye white
  p: '#141414', // pupil
  m: '#3b0a06', // mouth
  t: '#f0e8d8', // teeth
  b: '#b3140f', // blood
  B: '#6e0906', // dried blood
};

export const FACE_W = 20;
export const FACE_H = 23;

export const FACE_BASE: readonly string[] = [
  '......kkkkkkkk......',
  '....kkhhhhhhhhkk....',
  '...khhHhhhhhhHhhk...',
  '..khhhhhhhhhhhhhhk..',
  '..khhhhhhhhhhhhhhk..',
  '..khhsssssssssshhk..',
  '..khssllllllllsshk..',
  '..kssllllllllllssk..',
  '..ksleeelllleeelsk..',
  '.kkslwwwllllwwwlskk.',
  '.ksslwpwllllwpwlssk.',
  '.kSsllllllllllllsSk.',
  '.kSslllllSSlllllsSk.',
  '..kslllllSSlllllsk..',
  '..kssllllllllllssk..',
  '..ksSllllllllllSsk..',
  '..ksSllmmmmmmllSsk..',
  '..ksSllllllllllSsk..',
  '...kSSllllllllSSk...',
  '...kSSSllllllSSSk...',
  '....kSSSSSSSSSSk....',
  '.....kkSSSSSSkk.....',
  '.......kkkkkk.......',
];

export interface Patch {
  x: number;
  y: number;
  rows: string[];
}

// Brows/eyes live in rows 7-10, mouth in rows 15-17, all at x=5..14.
const eyes = (rows: [string, string, string, string]): Patch => ({ x: 5, y: 7, rows });
const mouth = (rows: [string, string, string]): Patch => ({ x: 5, y: 15, rows });

const NEUTRAL_EYES = eyes(['llllllllll', 'eeelllleee', 'wwwllllwww', 'wpwllllwpw']);
const ANGRY_EYES = eyes(['eellllllee', 'leeelleeel', 'wwwllllwww', 'wpwllllwpw']);

export const EXPRESSIONS: Record<Expression, Patch[]> = {
  idle: [NEUTRAL_EYES, mouth(['llllllllll', 'llmmmmmmll', 'llllllllll'])],
  working: [
    eyes(['eellllllee', 'leeelleeel', 'lkkllllkkl', 'wpwllllwpw']),
    mouth(['llllllllll', 'lmttttttml', 'llmmmmmmll']),
  ],
  waiting: [
    eyes(['eeelllleee', 'llllllllll', 'wwwllllwww', 'wpwllllwpw']),
    mouth(['llllllllll', 'lllmmmmlll', 'lllmmmmlll']),
  ],
  done: [ANGRY_EYES, mouth(['mllllllllm', 'mttttttttm', 'lmmmmmmmml'])],
  error: [
    eyes(['lleelleell', 'eellllllee', 'llllllllll', 'kkkllllkkk']),
    mouth(['llllllllll', 'lllmmmmlll', 'llmllllmll']),
  ],
  dead: [
    eyes(['llllllllll', 'klkllllklk', 'lkllllllkl', 'klkllllklk']),
    mouth(['llllllllll', 'llmmmmmmll', 'lllmmmmlll']),
  ],
};

/** Idle frames: look ahead, left, ahead, right. */
export const LOOK: Patch[] = [
  { x: 5, y: 10, rows: ['wpwllllwpw'] },
  { x: 5, y: 10, rows: ['pwwllllpww'] },
  { x: 5, y: 10, rows: ['wpwllllwpw'] },
  { x: 5, y: 10, rows: ['wwpllllwwp'] },
];

type Wound = readonly [x: number, y: number, color: string];

/** Damage per tier; tiers accumulate. */
export const WOUNDS: readonly (readonly Wound[])[] = [
  [],
  [[14, 6, 'b'], [15, 7, 'b'], [15, 8, 'B']],
  [[4, 12, 'b'], [4, 13, 'b'], [5, 14, 'B'], [11, 4, 'b']],
  [[8, 5, 'b'], [8, 6, 'b'], [9, 7, 'B'], [15, 12, 'b'], [15, 13, 'b'], [14, 14, 'B'], [6, 18, 'b']],
  [[10, 5, 'b'], [11, 6, 'B'], [4, 11, 'b'], [3, 15, 'b'], [12, 19, 'B'], [13, 18, 'b'], [7, 20, 'B'], [16, 10, 'b']],
];

function apply(grid: string[][], p: Patch): void {
  p.rows.forEach((row, i) => {
    const line = grid[p.y + i];
    if (!line) return;
    [...row].forEach((ch, j) => {
      if (p.x + j < line.length) line[p.x + j] = ch;
    });
  });
}

export function composeFace(expression: Expression, tier: Tier, frame: number): string[] {
  const grid = FACE_BASE.map((r) => [...r]);
  for (const p of EXPRESSIONS[expression]) apply(grid, p);
  if (expression === 'idle') apply(grid, LOOK[frame % LOOK.length]!);
  for (const wounds of WOUNDS.slice(1, tier + 1)) {
    for (const [x, y, ch] of wounds) {
      const line = grid[y];
      if (line) line[x] = ch;
    }
  }
  return grid.map((r) => r.join(''));
}

// 3×5 font for labels and the tally.
export const SMALL: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

// 5×7 font for the big red counters.
export const BIG: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
};
