import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SMALL } from '../src/ui/font.ts';

test('font is well-formed and covers what the UI draws', () => {
  for (const [ch, g] of Object.entries(SMALL)) {
    assert.equal(g.length, 5, `"${ch}"`);
    for (const row of g) assert.equal(row.length, 3, `"${ch}"`);
  }
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%-: !?') assert.ok(SMALL[ch], `missing "${ch}"`);
});
