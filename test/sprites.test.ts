import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIG, EXPRESSIONS, FACE_BASE, FACE_H, FACE_W, PALETTE, SMALL, WOUNDS, composeFace } from '../src/ui/sprites.ts';

test('face base is a FACE_W×FACE_H grid of palette colors', () => {
  assert.equal(FACE_BASE.length, FACE_H);
  FACE_BASE.forEach((row, y) => {
    assert.equal(row.length, FACE_W, `row ${y}: "${row}"`);
    for (const ch of row) assert.ok(ch in PALETTE, `row ${y}: unknown color "${ch}"`);
  });
});

test('every expression patch stays inside the face and uses the palette', () => {
  for (const [name, patches] of Object.entries(EXPRESSIONS)) {
    for (const p of patches) {
      p.rows.forEach((row, i) => {
        assert.ok(p.y + i < FACE_H, `${name}: row ${p.y + i} out of bounds`);
        assert.ok(p.x + row.length <= FACE_W, `${name}: "${row}" overflows`);
        for (const ch of row) assert.ok(ch in PALETTE, `${name}: unknown color "${ch}"`);
      });
    }
  }
});

test('wounds stay inside the face, are cumulative-ready and use the palette', () => {
  assert.equal(WOUNDS.length, 5);
  assert.equal(WOUNDS[0]?.length, 0, 'tier 0 is unharmed');
  for (const tier of WOUNDS) {
    for (const [x, y, ch] of tier) {
      assert.ok(x >= 0 && x < FACE_W && y >= 0 && y < FACE_H, `wound ${x},${y} out of bounds`);
      assert.ok(ch in PALETTE);
    }
  }
});

test('composeFace applies the expression and accumulates wounds', () => {
  const calm = composeFace('idle', 0, 0);
  const hurt = composeFace('idle', 4, 0);
  assert.equal(calm.length, FACE_H);
  assert.ok(calm.every((r) => r.length === FACE_W));
  const diff = calm.flatMap((r, y) => [...r].filter((c, x) => c !== hurt[y]?.[x])).length;
  const totalWounds = WOUNDS.slice(1).reduce((n, t) => n + t.length, 0);
  assert.ok(diff > 0 && diff <= totalWounds);
  assert.notDeepEqual(composeFace('waiting', 0, 0), calm);
  assert.notDeepEqual(composeFace('idle', 0, 1), calm, 'idle looks around');
});

test('fonts are well-formed', () => {
  for (const [ch, g] of Object.entries(SMALL)) {
    assert.equal(g.length, 5, `small "${ch}"`);
    for (const row of g) assert.equal(row.length, 3, `small "${ch}"`);
  }
  for (const [ch, g] of Object.entries(BIG)) {
    assert.equal(g.length, 7, `big "${ch}"`);
    for (const row of g) assert.equal(row.length, 5, `big "${ch}"`);
  }
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%-: ') assert.ok(SMALL[ch], `small missing "${ch}"`);
  for (const ch of '0123456789%-') assert.ok(BIG[ch], `big missing "${ch}"`);
});
