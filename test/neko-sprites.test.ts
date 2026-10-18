import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_FRAMES, CAT_H, CAT_PALETTE, catFrame, mirror } from '../src/ui/neko-sprites.ts';
import { CAT_W, type CatMode } from '../src/ui/neko-logic.ts';

const MODES: CatMode[] = ['sleep', 'run', 'sit', 'wash', 'alert', 'hiss'];

test('every mode has at least one frame of CAT_W×CAT_H in palette colors', () => {
  for (const mode of MODES) {
    const frames = CAT_FRAMES[mode];
    assert.ok(frames.length >= 1, mode);
    frames.forEach((f, i) => {
      assert.equal(f.length, CAT_H, `${mode}[${i}] height`);
      f.forEach((row, y) => {
        assert.equal(row.length, CAT_W, `${mode}[${i}] row ${y}: "${row}"`);
        for (const ch of row) assert.ok(ch in CAT_PALETTE, `${mode}[${i}] row ${y}: "${ch}"`);
      });
    });
  }
});

test('animated modes actually animate', () => {
  for (const mode of ['run', 'sleep', 'wash', 'hiss'] as const) {
    assert.ok(CAT_FRAMES[mode].length >= 2, mode);
    assert.notDeepEqual(CAT_FRAMES[mode][0], CAT_FRAMES[mode][1], mode);
  }
});

test('catFrame cycles frames and mirrors when facing left', () => {
  assert.deepEqual(catFrame('run', 1, 0), CAT_FRAMES.run[0]);
  assert.deepEqual(catFrame('run', 1, 1), CAT_FRAMES.run[1]);
  assert.deepEqual(catFrame('run', 1, 2), CAT_FRAMES.run[0]);
  assert.deepEqual(catFrame('run', -1, 0), mirror(CAT_FRAMES.run[0]!));
  assert.deepEqual(mirror(['ab.', 'k..']), ['.ba', '..k']);
});
