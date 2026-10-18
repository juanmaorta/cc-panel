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
