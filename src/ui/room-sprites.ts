// Original pixel art in the spirit of Habbo avatars. No Sulake assets.
import type { Look, Pose } from './room-logic.ts';

export const AVATAR_W = 12;
export const AVATAR_H = 21;

/** Colors that do not depend on the session's look. s/h/c/p are skin/hair/shirt/pants. */
export const AVATAR_FIXED: Record<string, string> = {
  k: '#1a1410', // outline
  e: '#1a1410', // eyes
  m: '#8a3020', // mouth
  o: '#202020', // shoes
  r: '#ff3a1a', // error eyes
};

export const AVATAR_BASE: readonly string[] = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '..khsssshk..',
  '..ksessesk..',
  '..kssssssk..',
  '..kssmmssk..',
  '...kssssk...',
  '....kssk....',
  '..kcccccck..',
  '.kcccccccck.',
  '.kcccccccck.',
  '.kcccccccck.',
  '.ksccccccsk.',
  '..kcccccck..',
  '..kppppppk..',
  '..kppkkppk..',
  '..kpk..kpk..',
  '..kpk..kpk..',
  '..kpk..kpk..',
  '..koo..ook..',
  '..kkk..kkk..',
];

type Px = readonly [x: number, y: number, color: string];

/** Arm raised on one side: hand above the head, sleeve down to the shoulder. */
function armUp(side: 'left' | 'right'): Px[] {
  const [arm, out] = side === 'left' ? [1, 0] : [10, 11];
  const px: Px[] = [[arm, 2, 's'], [out, 2, 'k'], [arm, 1, 'k']];
  for (let y = 3; y <= 8; y++) px.push([arm, y, 'c'], [out, y, 'k']);
  // Remove the hanging arm on that side.
  const inner = side === 'left' ? 2 : 9;
  for (let y = 9; y <= 12; y++) px.push([arm, y, 'k'], [out, y, '.'], [inner, y, 'c']);
  return px;
}

export const POSE_PATCHES: Record<Pose, readonly Px[]> = {
  typing: [[3, 12, 'c'], [4, 12, 's'], [7, 12, 's'], [8, 12, 'c']], // hands forward on the keyboard
  sleeping: [[4, 3, 's'], [7, 3, 's'], [4, 4, 'k'], [7, 4, 'k'], [5, 5, 's'], [6, 5, 's']], // eyes shut, mouth closed
  alert: [...armUp('right'), [5, 5, 'm'], [6, 5, 'm'], [5, 4, 'm'], [6, 4, 'm']], // hand up, mouth open
  cheer: [...armUp('left'), ...armUp('right'), [4, 5, 'm'], [7, 5, 'm']], // both arms up, grin
  smoke: [[4, 3, 'r'], [7, 3, 'r']],
};

export function composeAvatar(pose: Pose): string[] {
  const grid = AVATAR_BASE.map((r) => [...r]);
  for (const [x, y, ch] of POSE_PATCHES[pose]) {
    const row = grid[y];
    if (row) row[x] = ch;
  }
  return grid.map((r) => r.join(''));
}

export function avatarColors(look: Look): Record<string, string> {
  return { ...AVATAR_FIXED, s: look.skin, h: look.hair, c: look.shirt, p: look.pants };
}
