import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillPoly, project, type PixelSink } from '../src/ui/iso.ts';

function sink() {
  const px = new Set<string>();
  const rects: [number, number, number, number][] = [];
  const s: PixelSink = {
    fillStyle: '',
    fillRect(x, y, w, h) {
      rects.push([x, y, w, h]);
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px.add(`${x + i},${y + j}`);
    },
  };
  return { s, px, rects };
}

test('project maps world units to 2:1 screen pixels', () => {
  assert.deepEqual(project(0, 0, 0), [0, 0]);
  assert.deepEqual(project(4, 0, 0), [8, 4]);
  assert.deepEqual(project(0, 4, 0), [-8, 4]);
  assert.deepEqual(project(4, 4, 3), [0, 5]);
});

test('fillPoly only emits integer rects', () => {
  const { s, rects } = sink();
  fillPoly(s, [project(0, 0, 0), project(8, 0, 0), project(8, 6, 0), project(0, 6, 0)], '#fff');
  assert.ok(rects.length > 0);
  for (const r of rects) assert.ok(r.every(Number.isInteger), `non-integer rect ${r}`);
});

test('fillPoly fills an axis-aligned rectangle exactly', () => {
  const { s, px } = sink();
  fillPoly(s, [[0, 0], [4, 0], [4, 3], [0, 3]], '#fff');
  assert.equal(px.size, 12);
  assert.ok(px.has('0,0') && px.has('3,2') && !px.has('4,0') && !px.has('0,3'));
});

test('fillPoly fills a diamond symmetrically', () => {
  const { s, px } = sink();
  fillPoly(s, [[8, 0], [16, 4], [8, 8], [0, 4]], '#fff');
  const rows = new Map<number, number>();
  for (const p of px) {
    const y = Number(p.split(',')[1]);
    rows.set(y, (rows.get(y) ?? 0) + 1);
  }
  assert.equal(rows.get(0) === rows.get(7), true);
  assert.ok((rows.get(3) ?? 0) > (rows.get(0) ?? 0));
});

test('fillPoly ignores degenerate input', () => {
  const { s, rects } = sink();
  fillPoly(s, [[0, 0], [5, 5]], '#fff');
  assert.equal(rects.length, 0);
});
