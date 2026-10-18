import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_H, ROOM_W, roomLayout } from '../src/ui/room.ts';

test('one room on a 1920×528 viewport scales up by an integer and fits', () => {
  const l = roomLayout(1, 1920, 528);
  assert.ok(Number.isInteger(l.scale) && l.scale >= 3, `scale ${l.scale}`);
  assert.ok(l.width * l.scale <= 1920 && l.height * l.scale <= 528);
  assert.ok(l.rooms[0]!.left >= 0 && l.rooms[0]!.left + ROOM_W <= l.width);
  assert.ok(l.top >= 0 && l.top + ROOM_H <= l.height);
});

test('more rooms means a smaller (or equal) scale, never overlapping rooms', () => {
  const one = roomLayout(1, 1920, 528);
  const three = roomLayout(3, 1920, 528);
  assert.ok(three.scale <= one.scale);
  const r = three.rooms;
  for (let i = 1; i < r.length; i++) assert.ok(r[i]!.left >= r[i - 1]!.left + ROOM_W);
  assert.ok(r[r.length - 1]!.left + ROOM_W <= three.width);
});

test('tiny viewports still get scale 1', () => {
  assert.equal(roomLayout(6, 300, 100).scale, 1);
});

test('zero rooms is a valid, empty layout', () => {
  const l = roomLayout(0, 800, 400);
  assert.deepEqual(l.rooms, []);
  assert.ok(l.scale >= 1);
});
