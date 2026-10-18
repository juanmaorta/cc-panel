import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, focusArgv, insideCmux, parseFocusCommand } from '../src/relay.ts';

const WS = 'A74797B6-7297-46C0-A6EB-58F34F9747C9';
const SURF = '5FD931CE-E304-41CF-A1F6-2398029034B8';

test('parses a focus command from the hub', () => {
  const r = parseFocusCommand({ workspace: WS, surface: SURF, project: 'compas' });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { workspace: WS, surface: SURF, project: 'compas' });
});

test('rejects anything that is not two UUIDs and a short project name', () => {
  for (const bad of [
    null,
    { workspace: WS, surface: SURF },
    { workspace: '--help', surface: SURF, project: 'x' },
    { workspace: WS, surface: `${SURF}; open -a Calculator`, project: 'x' },
    { workspace: WS, surface: SURF, project: 'x'.repeat(300) },
  ]) {
    assert.equal(parseFocusCommand(bad).ok, false, JSON.stringify(bad));
  }
});

test('builds fixed argv lists: select workspace, focus panel, bring cmux forward', () => {
  assert.deepEqual(focusArgv({ workspace: WS, surface: SURF, project: 'p' }, '/bin/cmux'), [
    ['/bin/cmux', 'workspace', 'select', '--workspace', WS],
    ['/bin/cmux', 'focus-panel', '--panel', SURF, '--workspace', WS],
    ['/usr/bin/open', '-b', 'com.cmuxterm.app'],
  ]);
});

test('knows whether it runs inside cmux', () => {
  assert.equal(insideCmux({ CMUX_WORKSPACE_ID: WS, CMUX_SOCKET_PATH: '/s' }), true);
  assert.equal(insideCmux({}), false);
  assert.equal(insideCmux({ CMUX_WORKSPACE_ID: WS }), false, 'needs the socket too');
});

test('backoff grows and caps', () => {
  assert.equal(backoffMs(0), 1000);
  assert.equal(backoffMs(1), 2000);
  assert.equal(backoffMs(10), 30_000);
});
