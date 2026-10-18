import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, defaultHostName } from '../src/config.ts';

const home = '/Users/j';

test('fills defaults', () => {
  const r = parseConfig({ token: 'x'.repeat(32), host: 'laptop' }, home);
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    host: 'laptop',
    token: 'x'.repeat(32),
    hubUrl: 'http://127.0.0.1:7420',
    hub: { bind: '127.0.0.1', port: 7420, stateFile: '/Users/j/.local/state/cc-panel/state.json' },
  });
});

test('rejects short tokens, bad hosts, bad urls, bad ports', () => {
  const ok = { token: 'x'.repeat(32), host: 'laptop' };
  assert.equal(parseConfig({ ...ok, token: 'short' }, home).ok, false);
  assert.equal(parseConfig({ ...ok, host: 'a b' }, home).ok, false);
  assert.equal(parseConfig({ ...ok, hubUrl: 'not a url' }, home).ok, false);
  assert.equal(parseConfig({ ...ok, hubUrl: 'ftp://x' }, home).ok, false);
  assert.equal(parseConfig({ ...ok, hub: { port: 70000 } }, home).ok, false);
  assert.equal(parseConfig(null, home).ok, false);
});

test('defaultHostName strips .local and sanitizes', () => {
  assert.equal(defaultHostName('Jane-Laptop.local'), 'Jane-Laptop');
  assert.equal(defaultHostName('Office box (2)'), 'Office-box-2');
});
