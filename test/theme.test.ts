import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTheme, parseStored, resolveTheme } from '../src/ui/theme.ts';

test('without a stored choice the system preference wins', () => {
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
});

test('a stored choice overrides the system', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('toggling flips what is on screen', () => {
  assert.equal(nextTheme(resolveTheme(null, true)), 'light');
  assert.equal(nextTheme('light'), 'dark');
});

test('stored values are validated', () => {
  assert.equal(parseStored('dark'), 'dark');
  assert.equal(parseStored('light'), 'light');
  assert.equal(parseStored('purple'), null);
  assert.equal(parseStored(null), null);
});
