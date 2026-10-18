import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHubEvent } from '../src/report.ts';

const base = { session_id: 'abc-123', cwd: '/Users/j/p', transcript_path: '/t.jsonl' };

test('maps the fields the hub needs and nothing else', () => {
  const ev = toHubEvent(
    { ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    'laptop',
    42,
  );
  assert.deepEqual(ev, {
    host: 'laptop',
    sessionId: 'abc-123',
    event: 'PermissionRequest',
    cwd: '/Users/j/p',
    ts: 42,
    toolName: 'Bash',
  });
});

test('keeps notification_type', () => {
  const ev = toHubEvent({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'm' }, 'laptop', 1);
  assert.equal(ev?.notificationType, 'idle_prompt');
});

test('returns null for events the hub does not track or garbage', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'SubagentStop' }, 'laptop', 1), null);
  assert.equal(toHubEvent({ hook_event_name: 'Stop' }, 'laptop', 1), null);
  assert.equal(toHubEvent(null, 'laptop', 1), null);
  assert.equal(toHubEvent('x', 'laptop', 1), null);
});

const WS = 'A74797B6-7297-46C0-A6EB-58F34F9747C9';
const SURF = '5FD931CE-E304-41CF-A1F6-2398029034B8';

test('picks up the cmux workspace and surface from the hook environment', () => {
  const ev = toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { CMUX_WORKSPACE_ID: WS, CMUX_SURFACE_ID: SURF });
  assert.deepEqual(ev?.cmux, { workspace: WS, surface: SURF });
});

test('ignores cmux ids that are missing or not UUIDs', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, {})?.cmux, undefined);
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { CMUX_WORKSPACE_ID: WS })?.cmux, undefined);
  assert.equal(
    toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { CMUX_WORKSPACE_ID: '; rm -rf /', CMUX_SURFACE_ID: SURF })?.cmux,
    undefined,
  );
});
