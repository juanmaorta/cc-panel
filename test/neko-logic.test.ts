import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_W, SPEED, initialCat, stepCat, type Cat, type CatInput } from '../src/ui/neko-logic.ts';

const W = 100;
const input = (extra: Partial<CatInput> = {}): CatInput => ({ status: 'working', hostOnline: true, width: W, target: null, ...extra });
const cat = (extra: Partial<Cat> = {}): Cat => ({ x: 40, dir: 1, mode: 'sit', ...extra });

function run(c: Cat, i: CatInput, steps: number): Cat {
  for (let n = 0; n < steps; n++) c = stepCat(c, i);
  return c;
}

test('initial position is deterministic per session and inside the floor', () => {
  assert.deepEqual(initialCat('abc', W), initialCat('abc', W));
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const c = initialCat(id, W);
    assert.ok(c.x >= 0 && c.x <= W - CAT_W, `${id}: ${c.x}`);
  }
});

test('working cats patrol and bounce off the edges', () => {
  let c = stepCat(cat({ x: 40, dir: 1 }), input());
  assert.equal(c.mode, 'run');
  assert.equal(c.x, 40 + SPEED);
  c = run(cat({ x: W - CAT_W - 1, dir: 1 }), input(), 3);
  assert.equal(c.dir, -1);
  assert.ok(c.x <= W - CAT_W);
  c = run(cat({ x: 1, dir: -1 }), input(), 3);
  assert.equal(c.dir, 1);
  assert.ok(c.x >= 0);
});

test('status poses when nobody is pointing', () => {
  assert.equal(stepCat(cat(), input({ status: 'idle' })).mode, 'sleep');
  assert.equal(stepCat(cat(), input({ status: 'done' })).mode, 'wash');
  assert.equal(stepCat(cat(), input({ status: 'waiting' })).mode, 'alert');
  assert.equal(stepCat(cat(), input({ status: 'error' })).mode, 'hiss');
  assert.equal(stepCat(cat(), input({ status: 'working', hostOnline: false })).mode, 'sleep');
});

test('cats chase the pointer and sit when they get there', () => {
  let c = stepCat(cat({ x: 10, dir: -1 }), input({ status: 'idle', target: 80 }));
  assert.equal(c.mode, 'run');
  assert.equal(c.dir, 1);
  c = run(c, input({ status: 'idle', target: 80 }), 50);
  assert.equal(c.mode, 'sit');
  assert.ok(Math.abs(c.x + CAT_W / 2 - 80) <= SPEED);
});

test('the chase is clamped to the floor', () => {
  const c = run(cat({ x: 10 }), input({ target: 10_000 }), 100);
  assert.equal(c.x, W - CAT_W);
});

test('cats that need you ignore the pointer and stay put', () => {
  const c = run(cat({ x: 10 }), input({ status: 'waiting', target: 90 }), 10);
  assert.equal(c.x, 10);
  assert.equal(c.mode, 'alert');
});

test('a floor narrower than the cat pins it at 0', () => {
  assert.equal(stepCat(cat({ x: 5 }), input({ width: 8 })).x, 0);
});
