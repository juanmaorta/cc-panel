import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_FRAMES, CAT_H, CAT_PALETTE, catFrame } from '../src/ui/neko-sprites.ts';
import { CAT_W, type CatMode } from '../src/ui/neko-logic.ts';

const MODES: CatMode[] = ['sleep', 'run', 'sit', 'wash', 'alert', 'scratch'];

test('every sheet is made of CAT_W×CAT_H frames in palette colors', () => {
  for (const [sheet, frames] of Object.entries(CAT_FRAMES)) {
    assert.ok(frames.length >= 1, sheet);
    frames.forEach((f, i) => {
      assert.equal(f.length, CAT_H, `${sheet}[${i}] height`);
      f.forEach((row, y) => {
        assert.equal(row.length, CAT_W, `${sheet}[${i}] row ${y}`);
        for (const ch of row) assert.ok(ch in CAT_PALETTE, `${sheet}[${i}] row ${y}: "${ch}"`);
      });
    });
  }
});

test('every mode resolves to a frame in both directions', () => {
  for (const mode of MODES) {
    for (const dir of [1, -1] as const) assert.equal(catFrame(mode, dir, 0).length, CAT_H, `${mode} ${dir}`);
  }
});

test('animated modes alternate frames', () => {
  for (const mode of ['run', 'sleep', 'wash', 'scratch'] as const) {
    assert.notDeepEqual(catFrame(mode, 1, 0), catFrame(mode, 1, 1), mode);
    assert.deepEqual(catFrame(mode, 1, 0), catFrame(mode, 1, 2), `${mode} cycles`);
  }
});

test('running uses the real left/right sprites, not a mirror', () => {
  assert.deepEqual(catFrame('run', 1, 0), CAT_FRAMES.runRight[0]);
  assert.deepEqual(catFrame('run', -1, 0), CAT_FRAMES.runLeft[0]);
});
