import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_H, AVATAR_W, AVATAR_BASE, AVATAR_FIXED, POSE_PATCHES, avatarColors, composeAvatar } from '../src/ui/room-sprites.ts';
import type { Pose } from '../src/ui/room-logic.ts';

const SLOTS = new Set(['.', 's', 'h', 'c', 'p', ...Object.keys(AVATAR_FIXED)]);

test('avatar base is AVATAR_W×AVATAR_H with known colors', () => {
  assert.equal(AVATAR_BASE.length, AVATAR_H);
  AVATAR_BASE.forEach((row, y) => {
    assert.equal(row.length, AVATAR_W, `row ${y}: "${row}"`);
    for (const ch of row) assert.ok(SLOTS.has(ch), `row ${y}: "${ch}"`);
  });
});

test('pose patches stay in bounds and use known colors', () => {
  for (const [pose, patch] of Object.entries(POSE_PATCHES)) {
    for (const [x, y, ch] of patch) {
      assert.ok(x >= 0 && x < AVATAR_W && y >= 0 && y < AVATAR_H, `${pose}: ${x},${y}`);
      assert.ok(SLOTS.has(ch), `${pose}: "${ch}"`);
    }
  }
});

test('every pose composes to a full grid, and poses differ', () => {
  const poses: Pose[] = ['typing', 'sleeping', 'alert', 'cheer', 'smoke'];
  const grids = poses.map((p) => composeAvatar(p));
  for (const g of grids) {
    assert.equal(g.length, AVATAR_H);
    assert.ok(g.every((r) => r.length === AVATAR_W));
  }
  assert.notDeepEqual(composeAvatar('cheer'), composeAvatar('typing'));
  assert.notDeepEqual(composeAvatar('alert'), composeAvatar('cheer'));
});

test('avatarColors maps look slots and keeps fixed colors', () => {
  const c = avatarColors({ skin: '#1', hair: '#2', shirt: '#3', pants: '#4' });
  assert.equal(c.s, '#1');
  assert.equal(c.h, '#2');
  assert.equal(c.c, '#3');
  assert.equal(c.p, '#4');
  assert.equal(c.k, AVATAR_FIXED.k);
});
