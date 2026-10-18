import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels, type Label } from '../src/ui/labels.ts';

const L = (id: string, x: number, y: number, priority = 0, w = 40, h = 7): Label => ({ id, x, y, w, h, priority });

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('non-overlapping labels stay where they are', () => {
  const out = placeLabels([L('a', 0, 0), L('b', 100, 0)]);
  assert.deepEqual(out.get('a'), 0);
  assert.deepEqual(out.get('b'), 0);
});

test('a colliding label is nudged up, the higher-priority one does not move', () => {
  const out = placeLabels([L('low', 10, 20, 1), L('high', 0, 20, 0)]);
  assert.equal(out.get('high'), 20);
  assert.ok(out.get('low')! < 20);
  assert.ok(!overlaps({ x: 0, y: out.get('high')!, w: 40, h: 7 }, { x: 10, y: out.get('low')!, w: 40, h: 7 }));
});

test('resolves a pile-up without any overlaps', () => {
  const labels = [L('a', 0, 50), L('b', 5, 50, 1), L('c', 10, 50, 2), L('d', 15, 48, 3)];
  const out = placeLabels(labels);
  const rects = labels.map((l) => ({ x: l.x, y: out.get(l.id)!, w: l.w, h: l.h }));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) assert.ok(!overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`);
});

test('placement is deterministic regardless of input order', () => {
  const labels = [L('a', 0, 50), L('b', 5, 50, 1), L('c', 10, 50, 1)];
  assert.deepEqual([...placeLabels(labels)].sort(), [...placeLabels([...labels].reverse())].sort());
});
